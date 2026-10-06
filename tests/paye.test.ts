import { computePaye } from "../src/engine/paye";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

describe("computePaye", () => {
  test("normal case: income spanning multiple bands", () => {
    const result = computePaye(
      { employeeId: "e1", stateOfResidence: "Lagos", annualGrossEmolumentNgn: 6_000_000, annualRentPaidNgn: 1_200_000, isMinimumWageEarner: false },
      repo,
      AS_OF
    );
    // rent relief = min(20% * 1,200,000, 500,000) = 240,000
    expect(result.rentReliefNgn).toBe(240_000);
    // taxable income = 6,000,000 - 240,000 = 5,760,000
    expect(result.taxableIncomeNgn).toBe(5_760_000);
    // bands: 800,000@0% + 2,200,000@15% + remaining 2,760,000@18%
    const expectedTax = 0 + 2_200_000 * 0.15 + 2_760_000 * 0.18;
    expect(result.annualTaxNgn).toBeCloseTo(expectedTax, 2);
  });

  test("rent relief cap: large rent still capped at ₦500,000", () => {
    const result = computePaye(
      { employeeId: "e2", stateOfResidence: "Rivers", annualGrossEmolumentNgn: 3_000_000, annualRentPaidNgn: 10_000_000, isMinimumWageEarner: false },
      repo,
      AS_OF
    );
    expect(result.rentReliefNgn).toBe(500_000);
  });

  test("zero income -> zero tax", () => {
    const result = computePaye(
      { employeeId: "e3", stateOfResidence: "Kano", annualGrossEmolumentNgn: 0, annualRentPaidNgn: 0, isMinimumWageEarner: false },
      repo,
      AS_OF
    );
    expect(result.annualTaxNgn).toBe(0);
  });

  test("income exactly at first-band ceiling (₦800,000) -> zero tax", () => {
    const result = computePaye(
      { employeeId: "e4", stateOfResidence: "Lagos", annualGrossEmolumentNgn: 800_000, annualRentPaidNgn: 0, isMinimumWageEarner: false },
      repo,
      AS_OF
    );
    expect(result.annualTaxNgn).toBe(0);
  });

  test("minimum wage earner is fully exempt regardless of stated income", () => {
    const result = computePaye(
      { employeeId: "e5", stateOfResidence: "Lagos", annualGrossEmolumentNgn: 5_000_000, annualRentPaidNgn: 0, isMinimumWageEarner: true },
      repo,
      AS_OF
    );
    expect(result.annualTaxNgn).toBe(0);
  });

  test("very high income reaches the top open-ended band", () => {
    const result = computePaye(
      { employeeId: "e6", stateOfResidence: "Abuja", annualGrossEmolumentNgn: 100_000_000, annualRentPaidNgn: 0, isMinimumWageEarner: false },
      repo,
      AS_OF
    );
    const topBand = result.bandBreakdown[result.bandBreakdown.length - 1];
    expect(topBand.rate).toBe(0.25);
    expect(topBand.amountTaxedNgn).toBeGreaterThan(0);
  });

  test("two employees in different states get the same tax amount but different relevant authority", () => {
    const lagos = computePaye({ employeeId: "e7", stateOfResidence: "Lagos", annualGrossEmolumentNgn: 2_000_000, annualRentPaidNgn: 0, isMinimumWageEarner: false }, repo, AS_OF);
    const kano = computePaye({ employeeId: "e8", stateOfResidence: "Kano", annualGrossEmolumentNgn: 2_000_000, annualRentPaidNgn: 0, isMinimumWageEarner: false }, repo, AS_OF);
    expect(lagos.annualTaxNgn).toBe(kano.annualTaxNgn);
    expect(lagos.relevantTaxAuthority).not.toBe(kano.relevantTaxAuthority);
  });
});
