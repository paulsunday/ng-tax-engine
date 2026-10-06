import { calculateDocumentTotals } from "../../src/accounting/invoiceCalculations";

describe("calculateDocumentTotals", () => {
  test("single line, VAT applied", () => {
    const result = calculateDocumentTotals([{ quantity: 2, unitPriceNgn: 50_000, vatRate: 0.075 }]);
    expect(result.subtotalNgn).toBe(100_000);
    expect(result.vatAmountNgn).toBe(7_500);
    expect(result.totalNgn).toBe(107_500);
  });

  test("multiple lines with different VAT rates sum independently", () => {
    const result = calculateDocumentTotals([
      { quantity: 1, unitPriceNgn: 100_000, vatRate: 0.075 },
      { quantity: 1, unitPriceNgn: 50_000, vatRate: 0 }, // zero-rated/exempt line
    ]);
    expect(result.subtotalNgn).toBe(150_000);
    expect(result.vatAmountNgn).toBe(7_500); // only the first line attracts VAT
    expect(result.totalNgn).toBe(157_500);
  });

  test("zero VAT rate produces zero VAT without error", () => {
    const result = calculateDocumentTotals([{ quantity: 3, unitPriceNgn: 10_000, vatRate: 0 }]);
    expect(result.vatAmountNgn).toBe(0);
    expect(result.totalNgn).toBe(30_000);
  });

  test("rejects zero or negative quantity", () => {
    expect(() => calculateDocumentTotals([{ quantity: 0, unitPriceNgn: 1000, vatRate: 0 }])).toThrow();
    expect(() => calculateDocumentTotals([{ quantity: -1, unitPriceNgn: 1000, vatRate: 0 }])).toThrow();
  });

  test("rejects an empty item list", () => {
    expect(() => calculateDocumentTotals([])).toThrow();
  });

  test("rejects negative unit price", () => {
    expect(() => calculateDocumentTotals([{ quantity: 1, unitPriceNgn: -500, vatRate: 0 }])).toThrow();
  });
});
