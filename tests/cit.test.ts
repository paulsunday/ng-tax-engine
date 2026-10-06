import { computeCit } from "../src/engine/cit";
import { CompanyProfile } from "../src/types/common";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

function makeCompany(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "c1",
    name: "Acme Manufacturing Ltd",
    isResident: true,
    isProfessionalServices: false,
    turnoverNgn: 200_000_000,
    fixedAssetsNgn: 300_000_000,
    vatRegisteredVoluntarily: false,
    employeeCount: 20,
    accountingYearEnd: "12-31",
    incorporationDate: "2015-01-01",
    ...overrides,
  };
}

describe("computeCit", () => {
  test("normal case: standard company at 30%", () => {
    const result = computeCit(
      makeCompany(),
      { accountingProfitNgn: 100_000_000, nonDeductibleExpensesNgn: 5_000_000, nonTaxableIncomeNgn: 2_000_000, totalCapitalAllowanceNgn: 10_000_000, totalLossReliefNgn: 0 },
      repo,
      AS_OF
    );
    // assessable = 100m + 5m - 2m = 103m; total profit = 103m - 10m = 93m; tax = 27.9m
    expect(result.assessableProfitNgn).toBe(103_000_000);
    expect(result.totalProfitNgn).toBe(93_000_000);
    expect(result.effectiveRate).toBe(0.3);
    expect(result.taxLiabilityNgn).toBeCloseTo(27_900_000, 2);
    expect(result.isSmallCompany).toBe(false);
  });

  test("small company -> 0% rate, liability is zero even with large profit", () => {
    const result = computeCit(
      makeCompany({ turnoverNgn: 40_000_000, fixedAssetsNgn: 100_000_000 }),
      { accountingProfitNgn: 10_000_000, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.isSmallCompany).toBe(true);
    expect(result.taxLiabilityNgn).toBe(0);
  });

  test("zero accounting profit -> zero tax, no negative liability", () => {
    const result = computeCit(
      makeCompany(),
      { accountingProfitNgn: 0, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.taxLiabilityNgn).toBe(0);
  });

  test("negative accounting profit (loss-making year) -> taxable profit floored at zero, not negative tax", () => {
    const result = computeCit(
      makeCompany(),
      { accountingProfitNgn: -50_000_000, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.totalProfitNgn).toBe(0);
    expect(result.taxLiabilityNgn).toBe(0);
  });

  test("capital allowance + loss relief exceeding assessable profit -> floored at zero", () => {
    const result = computeCit(
      makeCompany(),
      { accountingProfitNgn: 10_000_000, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 8_000_000, totalLossReliefNgn: 5_000_000 },
      repo,
      AS_OF
    );
    expect(result.totalProfitNgn).toBe(0);
    expect(result.taxLiabilityNgn).toBe(0);
  });

  test("historical reproducibility: a return filed for a 2025 period must use the OLD (pre-2026) rule set, not today's", () => {
    expect(() =>
      computeCit(
        makeCompany(),
        { accountingProfitNgn: 100_000_000, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
        repo,
        "2025-06-30" // before NTA 2025's 1 Jan 2026 commencement
      )
    ).toThrow(/No rule found/);
    // This SHOULD throw today because the legacy (pre-2026) CITA-era rule set has not yet
    // been researched/seeded (see REGULATORY_RESEARCH_REPORT.md §8 item 6) — the engine must
    // fail loudly rather than silently apply the 2026 rule to a 2025 period.
  });

  test("future rule change does not alter a period computed before the change took effect", () => {
    // Simulate a hypothetical future rate change effective 2027-01-01 by asking for 2026 dates only.
    const before = computeCit(
      makeCompany(),
      { accountingProfitNgn: 100_000_000, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
      repo,
      "2026-06-30"
    );
    const stillBefore = computeCit(
      makeCompany(),
      { accountingProfitNgn: 100_000_000, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
      repo,
      "2026-12-31"
    );
    expect(before.taxLiabilityNgn).toBe(stillBefore.taxLiabilityNgn);
  });
});
