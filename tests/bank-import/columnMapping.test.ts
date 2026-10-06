import { detectColumnMapping } from "../../src/bank-import/columnMapping";

describe("detectColumnMapping", () => {
  test("detects a standard debit/credit/balance statement layout", () => {
    const result = detectColumnMapping(["Date", "Narration", "Reference", "Debit", "Credit", "Balance"]);
    expect(result.requiresManualMapping).toBe(false);
    expect(result.mapping).toEqual({ date: 0, narration: 1, reference: 2, debit: 3, credit: 4, balance: 5, amount: null });
  });

  test("detects a single signed-amount column layout", () => {
    const result = detectColumnMapping(["Transaction Date", "Description", "Amount"]);
    expect(result.requiresManualMapping).toBe(false);
    expect(result.mapping.amount).toBe(2);
    expect(result.mapping.debit).toBeNull();
  });

  test("is case- and whitespace-insensitive", () => {
    const result = detectColumnMapping(["  DATE  ", "narration", "DEBIT", "credit"]);
    expect(result.requiresManualMapping).toBe(false);
  });

  test("flags requiresManualMapping when no date column can be found", () => {
    const result = detectColumnMapping(["Description", "Debit", "Credit"]);
    expect(result.requiresManualMapping).toBe(true);
    expect(result.reason).toMatch(/date/i);
  });

  test("flags requiresManualMapping when neither debit/credit nor amount can be found", () => {
    const result = detectColumnMapping(["Date", "Narration", "Reference"]);
    expect(result.requiresManualMapping).toBe(true);
    expect(result.reason).toMatch(/debit|credit|amount/i);
  });

  test("never guesses a column it has no keyword match for — unmapped fields stay null", () => {
    const result = detectColumnMapping(["Date", "Debit", "Credit"]);
    expect(result.mapping.narration).toBeNull();
    expect(result.mapping.reference).toBeNull();
    expect(result.mapping.balance).toBeNull();
  });
});
