import { normalizeRows } from "../../src/bank-import/rowNormalizer";
import { ColumnMapping } from "../../src/bank-import/columnMapping";

const debitCreditMapping: ColumnMapping = { date: 0, narration: 1, reference: 2, debit: 3, credit: 4, balance: 5, amount: null };
const amountMapping: ColumnMapping = { date: 0, narration: 1, reference: null, debit: null, credit: null, balance: null, amount: 2 };

describe("normalizeRows", () => {
  test("normalizes a standard debit/credit/balance row (DD/MM/YYYY date)", () => {
    const { rows, errors } = normalizeRows([["15/06/2026", "POS PURCHASE SHOPRITE", "REF123", "5,000.00", "", "95,000.00"]], debitCreditMapping);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toEqual({
      date: "2026-06-15",
      narration: "POS PURCHASE SHOPRITE",
      reference: "REF123",
      debitNgn: 5000,
      creditNgn: 0,
      balanceAfterNgn: 95000,
    });
  });

  test("normalizes an ISO-format date without ambiguity", () => {
    const { rows } = normalizeRows([["2026-06-15", "Salary", "", "", "500000.00", ""]], debitCreditMapping);
    expect(rows[0].date).toBe("2026-06-15");
    expect(rows[0].creditNgn).toBe(500000);
  });

  test("handles parenthesised negative amounts (common in exported statements)", () => {
    const { rows } = normalizeRows([["01/01/2026", "Fee", "", "(1,500.00)", "", ""]], debitCreditMapping);
    expect(rows[0].debitNgn).toBe(1500);
  });

  test("splits a single signed amount column into debit/credit correctly", () => {
    const { rows } = normalizeRows(
      [
        ["01/01/2026", "Payment received", "250.00"],
        ["02/01/2026", "Payment sent", "-100.00"],
      ],
      amountMapping
    );
    expect(rows[0]).toMatchObject({ debitNgn: 0, creditNgn: 250 });
    expect(rows[1]).toMatchObject({ debitNgn: 100, creditNgn: 0 });
  });

  test("rejects a row with an unparseable date rather than guessing", () => {
    const { rows, errors } = normalizeRows([["not-a-date", "X", "", "100", "", ""]], debitCreditMapping);
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/date/i);
  });

  test("rejects an ambiguous date where the 'month' part exceeds 12 rather than silently reinterpreting as US format", () => {
    // 13 cannot be a month in DD/MM, and this parser never falls back to MM/DD silently.
    const { rows, errors } = normalizeRows([["01/13/2026", "X", "", "100", "", ""]], debitCreditMapping);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  test("skips a row where both debit and credit resolve to zero", () => {
    const { rows, errors } = normalizeRows([["01/01/2026", "Zero row", "", "", "", ""]], debitCreditMapping);
    expect(rows).toHaveLength(0);
    expect(errors[0].reason).toMatch(/zero/i);
  });

  test("processes multiple rows independently — one bad row does not block the rest", () => {
    const { rows, errors } = normalizeRows(
      [
        ["01/01/2026", "Good row", "", "100", "", ""],
        ["bad-date", "Bad row", "", "100", "", ""],
        ["02/01/2026", "Also good", "", "", "200", ""],
      ],
      debitCreditMapping
    );
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });
});
