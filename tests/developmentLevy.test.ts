import { computeDevelopmentLevy } from "../src/engine/developmentLevy";
import { CompanyProfile } from "../src/types/common";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

function makeCompany(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "c1",
    name: "Beta Industries Ltd",
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

describe("computeDevelopmentLevy", () => {
  test("normal case: resident non-small company pays 4% of assessable profit", () => {
    const result = computeDevelopmentLevy(makeCompany(), 100_000_000, repo, AS_OF);
    expect(result.applicable).toBe(true);
    expect(result.levyLiabilityNgn).toBe(4_000_000);
  });

  test("exemption: small company -> not applicable, zero levy", () => {
    const result = computeDevelopmentLevy(
      makeCompany({ turnoverNgn: 30_000_000, fixedAssetsNgn: 100_000_000 }),
      50_000_000,
      repo,
      AS_OF
    );
    expect(result.applicable).toBe(false);
    expect(result.levyLiabilityNgn).toBe(0);
  });

  test("exemption: non-resident company -> not applicable regardless of size", () => {
    const result = computeDevelopmentLevy(makeCompany({ isResident: false }), 500_000_000, repo, AS_OF);
    expect(result.applicable).toBe(false);
    expect(result.levyLiabilityNgn).toBe(0);
  });

  test("zero assessable profit -> zero levy but still 'applicable'", () => {
    const result = computeDevelopmentLevy(makeCompany(), 0, repo, AS_OF);
    expect(result.applicable).toBe(true);
    expect(result.levyLiabilityNgn).toBe(0);
  });

  test("uses assessable profit (pre-capital-allowance), not the CIT taxable-profit figure", () => {
    const resultOnAssessable = computeDevelopmentLevy(makeCompany(), 100_000_000, repo, AS_OF);
    const resultOnLowerTaxableProfit = computeDevelopmentLevy(makeCompany(), 60_000_000, repo, AS_OF);
    expect(resultOnAssessable.levyLiabilityNgn).toBeGreaterThan(resultOnLowerTaxableProfit.levyLiabilityNgn);
  });
});
