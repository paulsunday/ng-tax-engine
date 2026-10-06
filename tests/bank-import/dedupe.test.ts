import { computeDedupeHash } from "../../src/bank-import/dedupe";
import { NormalizedBankRow } from "../../src/bank-import/rowNormalizer";

function row(overrides: Partial<NormalizedBankRow> = {}): NormalizedBankRow {
  return { date: "2026-06-15", narration: "POS PURCHASE", reference: "REF1", debitNgn: 5000, creditNgn: 0, balanceAfterNgn: 95000, ...overrides };
}

describe("computeDedupeHash", () => {
  test("identical rows produce the identical hash", () => {
    expect(computeDedupeHash("acct-1", row())).toBe(computeDedupeHash("acct-1", row()));
  });

  test("differs by bank account, even for identical transaction data", () => {
    expect(computeDedupeHash("acct-1", row())).not.toBe(computeDedupeHash("acct-2", row()));
  });

  test("differs when the amount differs", () => {
    expect(computeDedupeHash("acct-1", row())).not.toBe(computeDedupeHash("acct-1", row({ debitNgn: 5001 })));
  });

  test("is insensitive to narration case/whitespace differences (same real transaction, re-exported)", () => {
    expect(computeDedupeHash("acct-1", row({ narration: "pos purchase" }))).toBe(
      computeDedupeHash("acct-1", row({ narration: "  POS   Purchase  " }))
    );
  });

  test("ignores balanceAfterNgn (two overlapping statement exports may show different running balances)", () => {
    expect(computeDedupeHash("acct-1", row({ balanceAfterNgn: 1 }))).toBe(computeDedupeHash("acct-1", row({ balanceAfterNgn: 999999 })));
  });
});
