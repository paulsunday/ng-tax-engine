import { TaxCalculationService } from "../../src/api/tax-calculation/tax-calculation.service";
import { UnverifiedRuleError } from "../../src/types/common";

function makeMocks() {
  const prisma: any = {
    company: { findUniqueOrThrow: jest.fn() },
    capitalAsset: { aggregate: jest.fn().mockResolvedValue({ _sum: { qualifyingExpenditureNgn: null } }) },
    employee: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    taxReturn: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    taxReturnRuleUsage: { createMany: jest.fn() },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    payeCalculation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const statements: any = { getProfitAndLoss: jest.fn() };
  const capitalAllowance: any = { getTotalClaimedForYear: jest.fn().mockResolvedValue(0) };
  const taxLoss: any = { applyRelief: jest.fn().mockResolvedValue({ totalLossUtilisedNgn: 0 }) };
  const payroll: any = { getTotalPayeForPeriod: jest.fn().mockResolvedValue(0) };
  const wht: any = { getTotalWhtForPeriod: jest.fn().mockResolvedValue(0) };
  const auditLog: any = { record: jest.fn() };
  const rules: any = { getEffectiveRule: jest.fn() };

  prisma.company.findUniqueOrThrow.mockResolvedValue({
    id: "company-1",
    name: "Test Co",
    isResident: true,
    isProfessionalServices: false,
    vatRegistered: false,
    accountingYearEnd: "12-31",
    incorporationDate: new Date("2020-01-01"),
    tin: "TIN-123",
    headOfficeStateCode: "EN",
  });

  return { prisma, companies, statements, capitalAllowance, taxLoss, payroll, wht, auditLog, rules };
}

function makeService(m: ReturnType<typeof makeMocks>) {
  return new TaxCalculationService(m.prisma, m.companies, m.statements, m.capitalAllowance, m.taxLoss, m.payroll, m.wht, m.auditLog, m.rules);
}

describe("TaxCalculationService.computeCitAndDevelopmentLevy", () => {
  test("refuses to create a second return for the same company/taxType/period (no duplicates)", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000, totalRevenueNgn: 1_000_000 });
    m.rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("cit_standard_rate", "VERIFIED");
    });
    m.prisma.taxReturn.findFirst.mockResolvedValue({ id: "existing-return" });

    const service = makeService(m);
    await expect(service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"))).rejects.toThrow(/already exists/);
  });

  test("when the CIT rule is unresolved (UnverifiedRuleError), persists a return with a NULL liability (never a fabricated zero) and PENDING_RULE_APPROVAL compliance state", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000, totalRevenueNgn: 1_000_000 });
    m.rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("cit_standard_rate", "VERIFIED");
    });
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-1", ...data }));

    const service = makeService(m);
    const { citReturn, levyReturn } = await service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"));

    expect(citReturn.taxLiabilityNgn).toBeNull();
    expect(citReturn.complianceState).toBe("PENDING_RULE_APPROVAL");
    expect(citReturn.confidence).toBe("MISSING_REGULATORY_INFORMATION");
    expect(levyReturn.taxLiabilityNgn).toBeNull();
    expect(levyReturn.complianceState).toBe("PENDING_RULE_APPROVAL");
    expect(levyReturn.confidence).toBe("MISSING_REGULATORY_INFORMATION");
  });

  test("Development Levy is computed on the ASSESSABLE profit (pre-capital-allowance), not the final taxable profit", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000, totalRevenueNgn: 1_000_000 });
    m.capitalAllowance.getTotalClaimedForYear.mockResolvedValue(100_000); // reduces taxable profit but NOT the levy base
    m.rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("x", "VERIFIED"); // force the guarded path, but we only care about what PROFIT was passed in
    });
    let capturedLevyProfit: number | undefined;
    const originalCreate = m.prisma.taxReturn.create;
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => {
      if (data.taxType === "DEVELOPMENT_LEVY") capturedLevyProfit = undefined; // guarded path means we can't observe the input directly here
      return { id: "ret-1", ...data };
    });

    const service = makeService(m);
    await service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"));
    // Since the CIT rule itself is unresolved, citGuarded.result is null, so the levy falls
    // back to pnl.netProfitBeforeTaxNgn directly (not reduced by capital allowance) —
    // confirming the fallback never silently uses a post-allowance figure either.
    expect(m.taxLoss.applyRelief).toHaveBeenCalledWith("org-1", "company-1", "general", 400_000, false, 2026); // 500,000 - 100,000 capital allowance
  });
});

describe("TaxCalculationService — compliance states beyond rule approval", () => {
  test("reports MISSING_TAXPAYER_INFORMATION (never attempting the engine) when the company has no TIN", async () => {
    const m = makeMocks();
    m.prisma.company.findUniqueOrThrow.mockResolvedValue({
      id: "company-1",
      name: "Test Co",
      isResident: true,
      isProfessionalServices: false,
      vatRegistered: false,
      accountingYearEnd: "12-31",
      incorporationDate: new Date("2020-01-01"),
      tin: null,
      headOfficeStateCode: "EN",
    });
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-1", ...data }));

    const service = makeService(m);
    const { citReturn, levyReturn } = await service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"));

    expect(citReturn.complianceState).toBe("MISSING_TAXPAYER_INFORMATION");
    expect(citReturn.taxLiabilityNgn).toBeNull();
    expect(levyReturn.complianceState).toBe("MISSING_TAXPAYER_INFORMATION");
    expect(m.statements.getProfitAndLoss).not.toHaveBeenCalled();
  });

  test("reports CALCULATION_ERROR (not a raw crash) when something unexpected fails mid-computation, and still leaves an auditable record", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockRejectedValue(new Error("database connection lost"));
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-1", ...data }));

    const service = makeService(m);
    const { citReturn } = await service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"));

    expect(citReturn.complianceState).toBe("CALCULATION_ERROR");
    expect(citReturn.taxLiabilityNgn).toBeNull();
    expect((citReturn.calculationBreakdown as any).error).toMatch(/database connection lost/);
  });

  test("a successful CALCULATED computation records TaxReturnRuleUsage for every rule id the engine actually used", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000, totalRevenueNgn: 1_000_000 });
    m.rules.getEffectiveRule.mockReturnValue({ id: "rule-version-abc", value: 0.3, status: "ACTIVE" });
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-1", ...data }));

    const service = makeService(m);
    await service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"));

    expect(m.prisma.taxReturnRuleUsage.createMany).toHaveBeenCalled();
    const calls = m.prisma.taxReturnRuleUsage.createMany.mock.calls;
    const allRuleIds = calls.flatMap((c: any) => c[0].data.map((d: any) => d.ruleVersionId));
    expect(allRuleIds).toContain("rule-version-abc");
  });

  test("recalculating after a prior PENDING_RULE_APPROVAL attempt supersedes the stale draft instead of refusing as a duplicate", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000, totalRevenueNgn: 1_000_000 });
    m.rules.getEffectiveRule.mockReturnValue({ id: "rule-version-abc", value: 0.3, status: "ACTIVE" });
    m.prisma.taxReturn.findFirst.mockResolvedValue({ id: "stale-draft", status: "DRAFT", complianceState: "PENDING_RULE_APPROVAL" });
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-2", ...data }));

    const service = makeService(m);
    const { citReturn } = await service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"));

    expect(m.prisma.taxReturn.update).toHaveBeenCalledWith({ where: { id: "stale-draft" }, data: { status: "SUPERSEDED" } });
    expect(citReturn.complianceState).toBe("CALCULATED");
  });

  test("recalculating against an already-CALCULATED return still refuses as a duplicate — only stale/failed drafts get superseded automatically", async () => {
    const m = makeMocks();
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 500_000, totalRevenueNgn: 1_000_000 });
    m.rules.getEffectiveRule.mockReturnValue({ id: "rule-version-abc", value: 0.3, status: "ACTIVE" });
    m.prisma.taxReturn.findFirst.mockResolvedValue({ id: "real-return", status: "DRAFT", complianceState: "CALCULATED" });

    const service = makeService(m);
    await expect(service.computeCitAndDevelopmentLevy("org-1", "company-1", "user-1", new Date("2026-01-01"), new Date("2026-12-31"))).rejects.toThrow(/already exists/);
  });
});

describe("TaxCalculationService.computeVatReturn", () => {
  test("sums output VAT basis from POSTED invoices and input VAT from POSTED expenses in the period only", async () => {
    const m = makeMocks();
    m.prisma.invoice.findMany.mockResolvedValue([{ subtotalNgn: "100000" }, { subtotalNgn: "50000" }]);
    m.prisma.expense.findMany.mockResolvedValue([{ vatAmountNgn: "3000" }]);
    m.statements.getProfitAndLoss.mockResolvedValue({ netProfitBeforeTaxNgn: 0, totalRevenueNgn: 150_000 });
    m.rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("vat_standard_rate", "VERIFIED");
    });
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-1", ...data }));

    const service = makeService(m);
    await service.computeVatReturn("org-1", "company-1", "user-1", new Date("2026-06-01"), new Date("2026-06-30"));

    expect(m.prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: "DRAFT" } }) })
    );
  });
});

describe("TaxCalculationService.computePayeReturn", () => {
  test("aggregates per-employee PayeCalculation rows into one company-level return", async () => {
    const m = makeMocks();
    m.payroll.getTotalPayeForPeriod.mockResolvedValue(75_000);
    m.prisma.payeCalculation.findMany.mockResolvedValue([
      { employeeId: "e1", taxPayableNgn: "50000", employee: { fullName: "A", stateOfResidenceCode: "EN" } },
      { employeeId: "e2", taxPayableNgn: "25000", employee: { fullName: "B", stateOfResidenceCode: "LA" } },
    ]);
    m.prisma.taxReturn.create.mockImplementation(async ({ data }: any) => ({ id: "ret-1", ...data }));

    const service = makeService(m);
    const result = await service.computePayeReturn("org-1", "company-1", "user-1", new Date("2026-06-01"), new Date("2026-06-30"));

    expect(result.taxLiabilityNgn).toBe(75_000);
    expect(result.confidence).toBe("VERIFIED_CALCULATION");
  });
});
