import { calculateStraightLineMonthlyDepreciation } from "../../src/accounting/depreciation";

describe("calculateStraightLineMonthlyDepreciation", () => {
  test("normal case: even monthly amount over useful life", () => {
    const result = calculateStraightLineMonthlyDepreciation({
      costNgn: 1_200_000,
      salvageValueNgn: 0,
      usefulLifeMonths: 60,
      accumulatedDepreciationNgn: 0,
    });
    expect(result.amountNgn).toBe(20_000); // 1,200,000 / 60
    expect(result.isFullyDepreciated).toBe(false);
  });

  test("respects salvage value — never depreciates below it", () => {
    const result = calculateStraightLineMonthlyDepreciation({
      costNgn: 1_000_000,
      salvageValueNgn: 100_000,
      usefulLifeMonths: 36,
      accumulatedDepreciationNgn: 0,
    });
    expect(result.amountNgn).toBeCloseTo(25_000, 2); // (1,000,000 - 100,000) / 36
  });

  test("caps the final period's depreciation so accumulated never exceeds depreciable base", () => {
    const result = calculateStraightLineMonthlyDepreciation({
      costNgn: 1_200_000,
      salvageValueNgn: 0,
      usefulLifeMonths: 60,
      accumulatedDepreciationNgn: 1_190_000, // only 10,000 left to depreciate
    });
    expect(result.amountNgn).toBe(10_000); // capped, not the full 20,000 monthly amount
    expect(result.isFullyDepreciated).toBe(true);
  });

  test("fully depreciated asset posts zero further depreciation", () => {
    const result = calculateStraightLineMonthlyDepreciation({
      costNgn: 500_000,
      salvageValueNgn: 0,
      usefulLifeMonths: 24,
      accumulatedDepreciationNgn: 500_000,
    });
    expect(result.amountNgn).toBe(0);
    expect(result.isFullyDepreciated).toBe(true);
  });

  test("rejects salvage value greater than cost", () => {
    expect(() =>
      calculateStraightLineMonthlyDepreciation({
        costNgn: 100_000,
        salvageValueNgn: 150_000,
        usefulLifeMonths: 12,
        accumulatedDepreciationNgn: 0,
      })
    ).toThrow();
  });

  test("rejects zero or negative useful life", () => {
    expect(() =>
      calculateStraightLineMonthlyDepreciation({
        costNgn: 100_000,
        salvageValueNgn: 0,
        usefulLifeMonths: 0,
        accumulatedDepreciationNgn: 0,
      })
    ).toThrow();
  });
});
