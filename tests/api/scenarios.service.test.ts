import { ScenariosService } from "../../src/api/scenarios/scenarios.service";
import { UnverifiedRuleError } from "../../src/types/common";

function makeMocks() {
  const prisma: any = {
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    asset: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { costNgn: null } }) },
    assetDepreciationEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    scenario: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    scenarioAdjustment: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const companies: any = {
    getOneOrThrow: jest.fn().mockResolvedValue({
      id: "company-1",
      name: "Test Co",
      isResident: true,
      isProfessionalServices: false,
      vatRegistered: false,
      accountingYearEnd: "12-31",
      incorporationDate: new Date("2020-01-01"),
    }),
  };
  const statements: any = { getProfitAndLoss: jest.fn() };
  const auditLog: any = { record: jest.fn() };
  const rules: any = { tryGetEffectiveRule: jest.fn(), getEffectiveRule: jest.fn() };
  return { prisma, companies, statements, auditLog, rules };
}

describe("ScenariosService.generate — NORMAL", () => {
  test("NORMAL scenario has zero adjustments and equals the raw P&L net profit", async () => {
    const { prisma, companies, statements, auditLog, rules } = makeMocks();
    statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000 });
    rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("cit_standard_rate", "DRAFT_VERIFIED");
    });
    prisma.scenario.create.mockResolvedValue({ id: "scn-1" });
    prisma.scenario.findUnique.mockResolvedValue({ id: "scn-1", companyId: "company-1", accountingProfitNgn: "500000", adjustments: [] });

    const service = new ScenariosService(prisma, companies, statements, auditLog, rules);
    await service.generate("org-1", "company-1", "user-1", "NORMAL", new Date("2026-06-01"), new Date("2026-06-30"));

    const createArgs = prisma.scenario.create.mock.calls[0][0].data;
    expect(createArgs.accountingProfitNgn).toBe(500_000);
  });
});

describe("ScenariosService.generate — tax-engine governance integration", () => {
  test("an UnverifiedRuleError from the CIT engine is caught and reported as PENDING_RULE_APPROVAL, not thrown", async () => {
    const { prisma, companies, statements, auditLog, rules } = makeMocks();
    statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000 });
    rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("cit_standard_rate", "DRAFT_VERIFIED");
    });
    prisma.scenario.create.mockResolvedValue({ id: "scn-1" });
    prisma.scenario.findUnique.mockResolvedValue({ id: "scn-1", companyId: "company-1" });

    const service = new ScenariosService(prisma, companies, statements, auditLog, rules);
    await service.generate("org-1", "company-1", "user-1", "NORMAL", new Date("2026-06-01"), new Date("2026-06-30"));

    const createArgs = prisma.scenario.create.mock.calls[0][0].data;
    expect(createArgs.taxLiabilityNgn).toBe(0);
    expect(createArgs.breakdown.taxResult.status).toBe("PENDING_RULE_APPROVAL");
  });
});

describe("ScenariosService.generate — PROFIT_SCENARIO", () => {
  test("includes unposted DRAFT invoice revenue as an adjustment, traceable to the real invoice", async () => {
    const { prisma, companies, statements, auditLog, rules } = makeMocks();
    statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000 });
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-draft-1", invoiceNumber: "INV-9", subtotalNgn: "150000", customer: { name: "Beta Ltd" } },
    ]);
    rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("cit_standard_rate", "DRAFT_VERIFIED");
    });
    prisma.scenario.create.mockResolvedValue({ id: "scn-2" });
    prisma.scenario.findUnique.mockResolvedValue({ id: "scn-2", companyId: "company-1" });

    const service = new ScenariosService(prisma, companies, statements, auditLog, rules);
    await service.generate("org-1", "company-1", "user-1", "PROFIT_SCENARIO", new Date("2026-06-01"), new Date("2026-06-30"));

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DRAFT" }) }));
    const createArgs = prisma.scenario.create.mock.calls[0][0].data;
    expect(createArgs.accountingProfitNgn).toBe(650_000); // 500,000 + 150,000

    const adjustmentArgs = prisma.scenarioAdjustment.create.mock.calls[0][0].data;
    expect(adjustmentArgs.sourceType).toBe("Invoice");
    expect(adjustmentArgs.sourceId).toBe("inv-draft-1");
    expect(adjustmentArgs.approvalStatus).toBe("PENDING"); // never auto-approved
  });
});

describe("ScenariosService.generate — LOSS_SCENARIO", () => {
  test("includes unposted DRAFT expenses as adjustments that REDUCE accounting profit", async () => {
    const { prisma, companies, statements, auditLog, rules } = makeMocks();
    statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000 });
    prisma.expense.findMany.mockResolvedValue([
      { id: "exp-draft-1", description: "Unposted repair bill", subtotalNgn: "80000", supplier: { name: "FixIt Ltd" } },
    ]);
    rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("cit_standard_rate", "DRAFT_VERIFIED");
    });
    prisma.scenario.create.mockResolvedValue({ id: "scn-3" });
    prisma.scenario.findUnique.mockResolvedValue({ id: "scn-3", companyId: "company-1" });

    const service = new ScenariosService(prisma, companies, statements, auditLog, rules);
    await service.generate("org-1", "company-1", "user-1", "LOSS_SCENARIO", new Date("2026-06-01"), new Date("2026-06-30"));

    const createArgs = prisma.scenario.create.mock.calls[0][0].data;
    expect(createArgs.accountingProfitNgn).toBe(420_000); // 500,000 - 80,000
  });
});
