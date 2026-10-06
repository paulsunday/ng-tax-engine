import { classifySmallCompany } from "../src/engine/classification";
import { CompanyProfile } from "../src/types/common";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-03-01";

function makeCompany(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "c1",
    name: "Test Co Ltd",
    isResident: true,
    isProfessionalServices: false,
    turnoverNgn: 10_000_000,
    fixedAssetsNgn: 50_000_000,
    vatRegisteredVoluntarily: false,
    employeeCount: 5,
    accountingYearEnd: "12-31",
    incorporationDate: "2020-01-01",
    ...overrides,
  };
}

describe("classifySmallCompany", () => {
  test("normal case: well within thresholds -> small company", () => {
    const result = classifySmallCompany(makeCompany(), repo, AS_OF);
    expect(result.isSmallCompany).toBe(true);
  });

  test("boundary: exactly at turnover and asset ceiling -> still small (<=, not <)", () => {
    const result = classifySmallCompany(
      makeCompany({ turnoverNgn: 50_000_000, fixedAssetsNgn: 250_000_000 }),
      repo,
      AS_OF
    );
    expect(result.isSmallCompany).toBe(true);
  });

  test("boundary: one naira over turnover ceiling -> not small", () => {
    const result = classifySmallCompany(makeCompany({ turnoverNgn: 50_000_001 }), repo, AS_OF);
    expect(result.isSmallCompany).toBe(false);
  });

  test("boundary: one naira over fixed-asset ceiling -> not small", () => {
    const result = classifySmallCompany(makeCompany({ fixedAssetsNgn: 250_000_001 }), repo, AS_OF);
    expect(result.isSmallCompany).toBe(false);
  });

  test("professional services override: low turnover but professional services -> never small", () => {
    const result = classifySmallCompany(
      makeCompany({ turnoverNgn: 1_000_000, fixedAssetsNgn: 1_000_000, isProfessionalServices: true }),
      repo,
      AS_OF
    );
    expect(result.isSmallCompany).toBe(false);
    expect(result.explanation).toMatch(/professional services/i);
  });

  test("zero turnover and assets -> small (not a crash / false negative)", () => {
    const result = classifySmallCompany(makeCompany({ turnoverNgn: 0, fixedAssetsNgn: 0 }), repo, AS_OF);
    expect(result.isSmallCompany).toBe(true);
  });

  test("every result cites at least one rule id for auditability", () => {
    const result = classifySmallCompany(makeCompany(), repo, AS_OF);
    expect(result.ruleIdsUsed.length).toBeGreaterThan(0);
  });
});
