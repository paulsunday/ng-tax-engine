import { applyLossRelief, TaxLossEntryInput } from "../src/engine/taxLoss";

function makeLoss(overrides: Partial<TaxLossEntryInput> = {}): TaxLossEntryInput {
  return {
    id: "l1",
    tradeOrBusiness: "retail",
    yearIncurred: 2024,
    originalLossNgn: 10_000_000,
    remainingLossNgn: 10_000_000,
    isDigitalAsset: false,
    ...overrides,
  };
}

describe("applyLossRelief", () => {
  test("normal case: partial utilisation against current-year profit", () => {
    const result = applyLossRelief("retail", 3_000_000, false, [makeLoss()], 2026);
    expect(result.totalLossUtilisedNgn).toBe(3_000_000);
    expect(result.remainingProfitAfterLossNgn).toBe(0);
    expect(result.utilisationsByEntry[0].remainingLossNgn).toBe(7_000_000);
  });

  test("full utilisation when profit exceeds remaining loss", () => {
    const result = applyLossRelief("retail", 50_000_000, false, [makeLoss()], 2026);
    expect(result.totalLossUtilisedNgn).toBe(10_000_000);
    expect(result.remainingProfitAfterLossNgn).toBe(40_000_000);
  });

  test("zero profit -> zero utilisation, loss carried forward untouched", () => {
    const result = applyLossRelief("retail", 0, false, [makeLoss()], 2026);
    expect(result.totalLossUtilisedNgn).toBe(0);
    expect(result.utilisationsByEntry[0].remainingLossNgn).toBe(10_000_000);
  });

  test("ring-fencing: a loss from a different trade never offsets this trade's profit", () => {
    const result = applyLossRelief("retail", 5_000_000, false, [makeLoss({ tradeOrBusiness: "manufacturing" })], 2026);
    expect(result.totalLossUtilisedNgn).toBe(0);
  });

  test("digital-asset ring-fencing: ordinary-trade profit cannot absorb a digital-asset loss", () => {
    const result = applyLossRelief("retail", 5_000_000, false, [makeLoss({ isDigitalAsset: true })], 2026);
    expect(result.totalLossUtilisedNgn).toBe(0);
  });

  test("no carry-back: a loss incurred in a LATER year than the assessment year is never applied", () => {
    const result = applyLossRelief("retail", 5_000_000, false, [makeLoss({ yearIncurred: 2027 })], 2026);
    expect(result.totalLossUtilisedNgn).toBe(0);
  });

  test("multiple loss years: oldest applied first (FIFO)", () => {
    const losses = [
      makeLoss({ id: "l_2023", yearIncurred: 2023, originalLossNgn: 2_000_000, remainingLossNgn: 2_000_000 }),
      makeLoss({ id: "l_2024", yearIncurred: 2024, originalLossNgn: 5_000_000, remainingLossNgn: 5_000_000 }),
    ];
    const result = applyLossRelief("retail", 3_000_000, false, losses, 2026);
    const l2023 = result.utilisationsByEntry.find((u) => u.lossEntryId === "l_2023")!;
    const l2024 = result.utilisationsByEntry.find((u) => u.lossEntryId === "l_2024")!;
    expect(l2023.amountUtilisedNgn).toBe(2_000_000); // fully consumed first
    expect(l2024.amountUtilisedNgn).toBe(1_000_000); // remainder from the newer loss
  });

  test("fully-utilised loss (remainingLossNgn = 0) is skipped", () => {
    const result = applyLossRelief("retail", 5_000_000, false, [makeLoss({ remainingLossNgn: 0 })], 2026);
    expect(result.totalLossUtilisedNgn).toBe(0);
  });
});
