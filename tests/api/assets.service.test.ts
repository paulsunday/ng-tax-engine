import { BadRequestException, ConflictException } from "@nestjs/common";
import { AssetsService } from "../../src/api/assets/assets.service";

function makeMocks() {
  const prisma: any = {
    asset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    assetDepreciationEntry: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (arr: any[]) => Promise.all(arr)),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const accounts: any = {
    getByCodeOrThrow: jest.fn((orgId: string, companyId: string, code: string) => Promise.resolve({ id: `account-${code}`, code })),
  };
  const journal: any = { postEntry: jest.fn().mockResolvedValue({ id: "journal-entry-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, accounts, journal, auditLog };
}

describe("AssetsService.create", () => {
  test("posts a balanced acquisition entry: Dr Fixed Assets, Cr Cash (when paid immediately)", async () => {
    const { prisma, companies, accounts, journal, auditLog } = makeMocks();
    prisma.asset.create.mockImplementation(async ({ data }: any) => ({ id: "asset-1", ...data }));
    const service = new AssetsService(prisma, companies, accounts, journal, auditLog);

    await service.create("org-1", "company-1", "user-1", {
      description: "Delivery van",
      acquisitionDate: new Date("2026-01-01"),
      costNgn: 10_000_000,
      usefulLifeMonths: 60,
      paidImmediately: true,
    });

    const lines = journal.postEntry.mock.calls[0][3].lines;
    expect(lines.find((l: any) => l.accountId === "account-1500")?.debitNgn).toBe(10_000_000); // Fixed Assets
    expect(lines.find((l: any) => l.accountId === "account-1000")?.creditNgn).toBe(10_000_000); // Cash
  });

  test("credits Accounts Payable instead of Cash when not paid immediately", async () => {
    const { prisma, companies, accounts, journal, auditLog } = makeMocks();
    prisma.asset.create.mockImplementation(async ({ data }: any) => ({ id: "asset-1", ...data }));
    const service = new AssetsService(prisma, companies, accounts, journal, auditLog);

    await service.create("org-1", "company-1", "user-1", {
      description: "Office furniture",
      acquisitionDate: new Date("2026-01-01"),
      costNgn: 2_000_000,
      usefulLifeMonths: 36,
      paidImmediately: false,
    });

    const lines = journal.postEntry.mock.calls[0][3].lines;
    expect(lines.find((l: any) => l.accountId === "account-2000")?.creditNgn).toBe(2_000_000); // Accounts Payable
  });

  test("rejects salvage value greater than cost before posting anything", async () => {
    const { prisma, companies, accounts, journal, auditLog } = makeMocks();
    const service = new AssetsService(prisma, companies, accounts, journal, auditLog);

    await expect(
      service.create("org-1", "company-1", "user-1", {
        description: "Bad asset",
        acquisitionDate: new Date(),
        costNgn: 100_000,
        salvageValueNgn: 150_000,
        usefulLifeMonths: 12,
        paidImmediately: true,
      })
    ).rejects.toThrow(BadRequestException);
    expect(journal.postEntry).not.toHaveBeenCalled();
  });
});

describe("AssetsService.postMonthlyDepreciation", () => {
  function asset(overrides: Partial<any> = {}) {
    return { id: "asset-1", companyId: "company-1", costNgn: "1200000", salvageValueNgn: "0", usefulLifeMonths: 60, accumulatedDepreciationNgn: "0", ...overrides };
  }

  test("posts Dr Depreciation Expense / Cr Accumulated Depreciation, balanced", async () => {
    const { prisma, companies, accounts, journal, auditLog } = makeMocks();
    prisma.asset.findUnique.mockResolvedValue(asset());
    prisma.assetDepreciationEntry.findUnique.mockResolvedValue(null);
    prisma.assetDepreciationEntry.create.mockResolvedValue({ id: "dep-1" });
    const service = new AssetsService(prisma, companies, accounts, journal, auditLog);

    await service.postMonthlyDepreciation("org-1", "company-1", "user-1", "asset-1", 2026, 1);

    const lines = journal.postEntry.mock.calls[0][3].lines;
    expect(lines.find((l: any) => l.accountId === "account-6400")?.debitNgn).toBe(20_000); // Depreciation Expense
    expect(lines.find((l: any) => l.accountId === "account-1510")?.creditNgn).toBe(20_000); // Accumulated Depreciation
  });

  test("REFUSES to double-post the same (asset, year, month) — idempotency (brief §51)", async () => {
    const { prisma, companies, accounts, journal, auditLog } = makeMocks();
    prisma.asset.findUnique.mockResolvedValue(asset());
    prisma.assetDepreciationEntry.findUnique.mockResolvedValue({ id: "already-exists" });
    const service = new AssetsService(prisma, companies, accounts, journal, auditLog);

    await expect(service.postMonthlyDepreciation("org-1", "company-1", "user-1", "asset-1", 2026, 1)).rejects.toThrow(ConflictException);
    expect(journal.postEntry).not.toHaveBeenCalled();
  });

  test("refuses to post depreciation on a fully-depreciated asset", async () => {
    const { prisma, companies, accounts, journal, auditLog } = makeMocks();
    prisma.asset.findUnique.mockResolvedValue(asset({ accumulatedDepreciationNgn: "1200000" }));
    prisma.assetDepreciationEntry.findUnique.mockResolvedValue(null);
    const service = new AssetsService(prisma, companies, accounts, journal, auditLog);

    await expect(service.postMonthlyDepreciation("org-1", "company-1", "user-1", "asset-1", 2026, 1)).rejects.toThrow(BadRequestException);
  });
});
