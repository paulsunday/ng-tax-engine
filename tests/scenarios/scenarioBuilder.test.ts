import { buildProfitScenario, buildLossScenario, AdjustmentCandidate } from "../../src/scenarios/scenarioBuilder";

describe("buildProfitScenario", () => {
  test("adds unposted invoice revenue on top of the base accounting profit", () => {
    const candidates: AdjustmentCandidate[] = [
      { sourceType: "Invoice", sourceId: "inv-1", description: "Draft invoice to Acme", amountNgn: 100_000 },
      { sourceType: "Invoice", sourceId: "inv-2", description: "Draft invoice to Beta", amountNgn: 50_000 },
    ];
    const result = buildProfitScenario(500_000, candidates);

    expect(result.totalAdjustmentNgn).toBe(150_000);
    expect(result.adjustedAccountingProfitNgn).toBe(650_000);
    expect(result.adjustments).toHaveLength(2);
  });

  test("with no unposted invoices, the scenario equals the base case exactly", () => {
    const result = buildProfitScenario(500_000, []);
    expect(result.adjustedAccountingProfitNgn).toBe(500_000);
  });
});

describe("buildLossScenario", () => {
  test("subtracts unposted expenses AND unposted depreciation from the base profit", () => {
    const expenses: AdjustmentCandidate[] = [{ sourceType: "Expense", sourceId: "exp-1", description: "Draft expense", amountNgn: 80_000 }];
    const depreciation: AdjustmentCandidate[] = [{ sourceType: "AssetDepreciation", sourceId: "asset-1", description: "June depreciation", amountNgn: 20_000 }];
    const result = buildLossScenario(500_000, expenses, depreciation);

    expect(result.totalAdjustmentNgn).toBe(-100_000);
    expect(result.adjustedAccountingProfitNgn).toBe(400_000);
  });

  test("can push accounting profit negative (a genuine loss) without being clamped to zero", () => {
    const expenses: AdjustmentCandidate[] = [{ sourceType: "Expense", sourceId: "exp-1", description: "Large draft expense", amountNgn: 600_000 }];
    const result = buildLossScenario(500_000, expenses, []);
    expect(result.adjustedAccountingProfitNgn).toBe(-100_000);
  });
});

describe("Profit >= Normal >= Loss invariant", () => {
  test("holds for any non-empty set of candidates (profit scenario never decreases profit, loss scenario never increases it)", () => {
    const normal = 300_000;
    const profit = buildProfitScenario(normal, [{ sourceType: "Invoice", sourceId: "i1", description: "x", amountNgn: 40_000 }]);
    const loss = buildLossScenario(normal, [{ sourceType: "Expense", sourceId: "e1", description: "y", amountNgn: 25_000 }], []);

    expect(profit.adjustedAccountingProfitNgn).toBeGreaterThanOrEqual(normal);
    expect(loss.adjustedAccountingProfitNgn).toBeLessThanOrEqual(normal);
    expect(profit.adjustedAccountingProfitNgn).toBeGreaterThan(loss.adjustedAccountingProfitNgn);
  });
});
