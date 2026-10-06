import { createHash } from "crypto";
import { NormalizedBankRow } from "./rowNormalizer";

/**
 * Deterministic fingerprint for a bank transaction row, used to detect duplicate imports
 * (e.g. the same statement uploaded twice, or overlapping date ranges between two
 * uploads) — brief §8: "Duplicate transactions" must be surfaced in reconciliation.
 * Deliberately does NOT include balanceAfterNgn (which can legitimately differ between
 * two statements covering overlapping periods if other transactions were reordered) or
 * any import/row ID.
 */
export function computeDedupeHash(bankAccountId: string, row: NormalizedBankRow): string {
  const normalizedNarration = row.narration.trim().toLowerCase().replace(/\s+/g, " ");
  const input = `${bankAccountId}|${row.date}|${row.debitNgn.toFixed(2)}|${row.creditNgn.toFixed(2)}|${normalizedNarration}|${row.reference ?? ""}`;
  return createHash("sha256").update(input).digest("hex");
}
