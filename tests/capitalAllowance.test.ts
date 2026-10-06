import { computeCapitalAllowanceForYear, CapitalAssetInput } from "../src/engine/capitalAllowance";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

function makeAsset(overrides: Partial<CapitalAssetInput> = {}): CapitalAssetInput {
  return {
    id: "a1",
    description: "Delivery van",
    assetClass: 3,
    qualifyingExpenditureNgn: 10_000_000,
    acquisitionDate: "2026-01-01",
    businessUsePercent: 100,
    priorAllowanceClaimedNgn: 0,
    ...overrides,
  };
}

describe("computeCapitalAllowanceForYear", () => {
  test("normal case: class 3 motor vehicle at 25% full year", () => {
    const result = computeCapitalAllowanceForYear(makeAsset(), 2026, 365, 365, repo, AS_OF);
    expect(result.allowanceClaimedNgn).toBe(2_500_000);
  });

  test("class 1 building at 10%", () => {
    const result = computeCapitalAllowanceForYear(
      makeAsset({ assetClass: 1, qualifyingExpenditureNgn: 20_000_000 }),
      2026,
      365,
      365,
      repo,
      AS_OF
    );
    expect(result.allowanceClaimedNgn).toBe(2_000_000);
  });

  test("short basis period is prorated", () => {
    const result = computeCapitalAllowanceForYear(makeAsset(), 2026, 180, 360, repo, AS_OF);
    expect(result.allowanceClaimedNgn).toBeCloseTo(1_250_000, 2); // 2.5m * 0.5
  });

  test("partial business use prorates the allowance when non-taxable income >= 10% of total income", () => {
    const result = computeCapitalAllowanceForYear(
      makeAsset({ businessUsePercent: 60, nonTaxableIncomePercentOfTotalIncome: 15 }),
      2026,
      365,
      365,
      repo,
      AS_OF
    );
    expect(result.allowanceClaimedNgn).toBeCloseTo(1_500_000, 2); // 2.5m * 0.6
  });

  test("s.27(4) carve-out: proration skipped when non-taxable income < 10% of total income, even with partial business use", () => {
    const result = computeCapitalAllowanceForYear(
      makeAsset({ businessUsePercent: 60, nonTaxableIncomePercentOfTotalIncome: 5 }),
      2026,
      365,
      365,
      repo,
      AS_OF
    );
    expect(result.allowanceClaimedNgn).toBe(2_500_000); // NOT reduced to 60%
  });

  test("allowance claim is capped at opening residue (fully written-down asset claims nothing further)", () => {
    const result = computeCapitalAllowanceForYear(
      makeAsset({ priorAllowanceClaimedNgn: 9_900_000 }), // residue = 100,000
      2026,
      365,
      365,
      repo,
      AS_OF
    );
    expect(result.allowanceClaimedNgn).toBe(100_000);
    expect(result.closingResidueNgn).toBe(0);
  });

  test("1% notional residue is recorded but never changes the claimable amount", () => {
    const result = computeCapitalAllowanceForYear(makeAsset(), 2026, 365, 365, repo, AS_OF);
    expect(result.notionalResidueNgn).toBe(100_000); // 1% of 10m
    expect(result.allowanceClaimedNgn).toBe(2_500_000); // unaffected by the notional figure
  });

  test("accounting depreciation is never referenced — register is purely tax-driven", () => {
    const result = computeCapitalAllowanceForYear(makeAsset(), 2026, 365, 365, repo, AS_OF);
    expect(Object.keys(result)).not.toContain("depreciation");
  });
});
