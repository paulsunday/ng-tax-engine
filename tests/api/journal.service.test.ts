import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JournalService } from "../../src/api/journal/journal.service";
import { UnbalancedJournalEntryError } from "../../src/accounting/doubleEntry";

function makeMocks() {
  const prisma: any = {
    account: { findMany: jest.fn() },
    journalEntry: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    journalLine: { findMany: jest.fn() },
    $transaction: jest.fn(async (fnOrArray: any) => {
      if (typeof fnOrArray === "function") return fnOrArray(prisma);
      return Promise.all(fnOrArray);
    }),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1", organizationId: "org-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, auditLog };
}

describe("JournalService.postEntry", () => {
  test("verifies the company belongs to the caller's organization before posting", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    companies.getOneOrThrow.mockRejectedValue(new NotFoundException("Company not found."));
    const service = new JournalService(prisma, companies, auditLog);

    await expect(
      service.postEntry("org-1", "company-1", "user-1", {
        entryDate: new Date(),
        description: "Test",
        source: "MANUAL",
        lines: [
          { accountId: "a1", debitNgn: 100, creditNgn: 0 },
          { accountId: "a2", debitNgn: 0, creditNgn: 100 },
        ],
      })
    ).rejects.toThrow(NotFoundException);
  });

  test("rejects an unbalanced entry BEFORE touching the database at all", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    const service = new JournalService(prisma, companies, auditLog);

    await expect(
      service.postEntry("org-1", "company-1", "user-1", {
        entryDate: new Date(),
        description: "Bad entry",
        source: "MANUAL",
        lines: [
          { accountId: "a1", debitNgn: 100, creditNgn: 0 },
          { accountId: "a2", debitNgn: 0, creditNgn: 50 },
        ],
      })
    ).rejects.toThrow(UnbalancedJournalEntryError);

    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test("rejects posting against an account that does not belong to this company", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findMany.mockResolvedValue([{ id: "a1" }]); // only one of the two accountIds resolved
    const service = new JournalService(prisma, companies, auditLog);

    await expect(
      service.postEntry("org-1", "company-1", "user-1", {
        entryDate: new Date(),
        description: "Test",
        source: "MANUAL",
        lines: [
          { accountId: "a1", debitNgn: 100, creditNgn: 0 },
          { accountId: "a2-from-another-company", debitNgn: 0, creditNgn: 100 },
        ],
      })
    ).rejects.toThrow(BadRequestException);
  });

  test("posts a balanced, valid entry and records an audit log entry", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    prisma.journalEntry.create.mockResolvedValue({ id: "entry-1", description: "Sale", source: "MANUAL", lines: [{}, {}] });
    const service = new JournalService(prisma, companies, auditLog);

    const result = await service.postEntry("org-1", "company-1", "user-1", {
      entryDate: new Date("2026-06-01"),
      description: "Sale",
      source: "MANUAL",
      lines: [
        { accountId: "a1", debitNgn: 1000, creditNgn: 0 },
        { accountId: "a2", debitNgn: 0, creditNgn: 1000 },
      ],
    });

    expect(result.id).toBe("entry-1");
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "POST", objectType: "JournalEntry" }));
  });
});

describe("JournalService.voidEntry", () => {
  test("refuses to void an entry that is not POSTED", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.journalEntry.findUnique.mockResolvedValue({ id: "e1", companyId: "company-1", status: "DRAFT", lines: [] });
    const service = new JournalService(prisma, companies, auditLog);

    await expect(service.voidEntry("org-1", "company-1", "user-1", "e1", "mistake")).rejects.toThrow(BadRequestException);
  });

  test("refuses to void an entry belonging to a different company (tenant isolation)", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.journalEntry.findUnique.mockResolvedValue({ id: "e1", companyId: "OTHER-company", status: "POSTED", lines: [] });
    const service = new JournalService(prisma, companies, auditLog);

    await expect(service.voidEntry("org-1", "company-1", "user-1", "e1", "mistake")).rejects.toThrow(NotFoundException);
  });

  test("posts a reversal entry with swapped debit/credit and flips the original to VOID", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    const originalLines = [
      { accountId: "cash", debitNgn: "1000", creditNgn: "0", description: "Sale" },
      { accountId: "revenue", debitNgn: "0", creditNgn: "1000", description: "Sale" },
    ];
    prisma.journalEntry.findUnique.mockResolvedValue({ id: "e1", companyId: "company-1", status: "POSTED", description: "Sale", lines: originalLines });
    prisma.journalEntry.create.mockImplementation(async ({ data }: any) => ({ id: "reversal-1", ...data, lines: data.lines.create }));

    const service = new JournalService(prisma, companies, auditLog);
    const reversal = await service.voidEntry("org-1", "company-1", "user-1", "e1", "data entry error");

    expect(reversal.reversalOfId).toBe("e1");
    expect(reversal.lines[0]).toMatchObject({ accountId: "cash", debitNgn: 0, creditNgn: 1000 });
    expect(reversal.lines[1]).toMatchObject({ accountId: "revenue", debitNgn: 1000, creditNgn: 0 });
    expect(prisma.journalEntry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { status: "VOID" } });
  });
});

describe("JournalService.getTrialBalance", () => {
  test("aggregates debits/credits per account and confirms the trial balance balances", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.journalLine.findMany.mockResolvedValue([
      { accountId: "cash", debitNgn: "1000", creditNgn: "0", account: { code: "1000", name: "Cash", type: "ASSET" } },
      { accountId: "revenue", debitNgn: "0", creditNgn: "1000", account: { code: "4000", name: "Revenue", type: "REVENUE" } },
      { accountId: "cash", debitNgn: "500", creditNgn: "0", account: { code: "1000", name: "Cash", type: "ASSET" } },
      { accountId: "revenue", debitNgn: "0", creditNgn: "500", account: { code: "4000", name: "Revenue", type: "REVENUE" } },
    ]);
    const service = new JournalService(prisma, companies, auditLog);

    const result = await service.getTrialBalance("org-1", "company-1");

    expect(result.totalDebit).toBe(1500);
    expect(result.totalCredit).toBe(1500);
    expect(result.isBalanced).toBe(true);
    expect(result.rows.find((r) => r.code === "1000")?.debitNgn).toBe(1500);
  });
});
