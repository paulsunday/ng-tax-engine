import {
  validateJournalLines,
  InvalidJournalLineError,
  UnbalancedJournalEntryError,
  sumDebits,
  sumCredits,
  buildReversalLines,
} from "../../src/accounting/doubleEntry";

describe("validateJournalLines (master-build-prompt §6)", () => {
  test("accepts a simple balanced two-line entry", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: 1000, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 1000 },
      ])
    ).not.toThrow();
  });

  test("accepts a balanced multi-line entry (one debit split across several credits)", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "accounts-receivable", debitNgn: 1075, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 1000 },
        { accountId: "vat-payable", debitNgn: 0, creditNgn: 75 },
      ])
    ).not.toThrow();
  });

  test("rejects an unbalanced entry", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: 1000, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 999 },
      ])
    ).toThrow(UnbalancedJournalEntryError);
  });

  test("rejects a line with both debit and credit set", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: 500, creditNgn: 500 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 1000 },
      ])
    ).toThrow(InvalidJournalLineError);
  });

  test("rejects a line with neither debit nor credit set (both zero)", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: 0, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 1000 },
      ])
    ).toThrow(InvalidJournalLineError);
  });

  test("rejects a negative amount", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: -100, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: -100 },
      ])
    ).toThrow(InvalidJournalLineError);
  });

  test("rejects an entry with fewer than two lines", () => {
    expect(() => validateJournalLines([{ accountId: "cash", debitNgn: 100, creditNgn: 0 }])).toThrow(InvalidJournalLineError);
  });

  test("tolerates sub-kobo floating point rounding noise but not a real 1 kobo mismatch", () => {
    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: 100.001, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 100.0 },
      ])
    ).not.toThrow();

    expect(() =>
      validateJournalLines([
        { accountId: "cash", debitNgn: 100.01, creditNgn: 0 },
        { accountId: "revenue", debitNgn: 0, creditNgn: 100.0 },
      ])
    ).toThrow(UnbalancedJournalEntryError);
  });
});

describe("sumDebits / sumCredits", () => {
  test("sum correctly across many lines", () => {
    const lines = [
      { accountId: "a", debitNgn: 300, creditNgn: 0 },
      { accountId: "b", debitNgn: 200, creditNgn: 0 },
      { accountId: "c", debitNgn: 0, creditNgn: 500 },
    ];
    expect(sumDebits(lines)).toBe(500);
    expect(sumCredits(lines)).toBe(500);
  });
});

describe("buildReversalLines (brief §11/§41 — never edit a posted entry, reverse it)", () => {
  test("swaps debit and credit on every line, preserving balance", () => {
    const original = [
      { accountId: "cash", debitNgn: 1000, creditNgn: 0, description: "Sale" },
      { accountId: "revenue", debitNgn: 0, creditNgn: 1000, description: "Sale" },
    ];
    const reversed = buildReversalLines(original);

    expect(reversed[0]).toMatchObject({ accountId: "cash", debitNgn: 0, creditNgn: 1000 });
    expect(reversed[1]).toMatchObject({ accountId: "revenue", debitNgn: 1000, creditNgn: 0 });
    expect(() => validateJournalLines(reversed)).not.toThrow();
  });
});
