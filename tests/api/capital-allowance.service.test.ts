import { BadRequestException } from "@nestjs/common";
import { CapitalAllowanceService } from "../../src/api/capital-allowance/capital-allowance.service";

function makeMocks() {
  const prisma: any = {
    capitalAsset: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    capitalAllowanceClaim: { findUnique: jest.fn(), create: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { allowanceClaimedNgn: null } }), findMany: jest.fn().mockResolvedValue([]) },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const rules: any = {
    getEffectiveRule: jest.fn().mockReturnValue({
      id: "rule-capall",
      value: [{ class: 3, rate: 0.25, assets: ["Motor Vehicle"] }],
      sourceDocument: "NTA",
      sourceReference: "First Schedule",
    }),
  };
  return { prisma, companies, rules };
}

describe("CapitalAllowanceService.claimForYear", () => {
  test("refuses to double-claim the same (asset, year) — idempotency", async () => {
    const { prisma, companies, rules } = makeMocks();
    prisma.capitalAsset.findUnique.mockResolvedValue({ id: "asset-1", companyId: "company-1", assetClass: 3, qualifyingExpenditureNgn: "1000000", acquisitionDate: new Date("2026-01-01"), disposalDate: null, businessUsePercent: "100" });
    prisma.capitalAllowanceClaim.findUnique.mockResolvedValue({ id: "existing-claim" });
    const service = new CapitalAllowanceService(prisma, companies, rules);

    await expect(service.claimForYear("org-1", "company-1", "asset-1", 2026, new Date())).rejects.toThrow(BadRequestException);
  });

  test("computes the class-3 (25%) allowance correctly for a fresh asset", async () => {
    const { prisma, companies, rules } = makeMocks();
    prisma.capitalAsset.findUnique.mockResolvedValue({ id: "asset-1", companyId: "company-1", description: "Van", assetClass: 3, qualifyingExpenditureNgn: "1000000", acquisitionDate: new Date("2026-01-01"), disposalDate: null, businessUsePercent: "100" });
    prisma.capitalAllowanceClaim.findUnique.mockResolvedValue(null);
    prisma.capitalAllowanceClaim.create.mockImplementation(async ({ data }: any) => ({ id: "claim-1", ...data }));
    const service = new CapitalAllowanceService(prisma, companies, rules);

    const { claim } = await service.claimForYear("org-1", "company-1", "asset-1", 2026, new Date());
    expect(claim.allowanceClaimedNgn).toBe(250_000);
  });
});

describe("CapitalAllowanceService.getTotalClaimedForYear", () => {
  test("sums claims across all of a company's assets for the year", async () => {
    const { prisma } = makeMocks();
    prisma.capitalAllowanceClaim.findMany.mockResolvedValue([{ allowanceClaimedNgn: "250000" }, { allowanceClaimedNgn: "100000" }]);
    const service = new CapitalAllowanceService(prisma, { getOneOrThrow: jest.fn() } as any, { getEffectiveRule: jest.fn() } as any);

    const total = await service.getTotalClaimedForYear("company-1", 2026);
    expect(total).toBe(350_000);
  });
});
