/**
 * Column auto-detection for uploaded bank statements (master-build-prompt §7:
 * "Where technically possible, extract transactions automatically... Allow users to map
 * columns manually when automatic detection fails."). Pure, framework-agnostic heuristics
 * — deliberately conservative: if the required fields can't be confidently located, this
 * reports requiresManualMapping rather than guessing and silently mis-importing a ledger.
 */

export type BankColumnField = "date" | "narration" | "reference" | "debit" | "credit" | "balance" | "amount";

export interface ColumnMapping {
  date: number | null;
  narration: number | null;
  reference: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  amount: number | null; // single signed-amount column, used instead of separate debit/credit when that's all the statement has
}

export interface ColumnDetectionResult {
  mapping: ColumnMapping;
  requiresManualMapping: boolean;
  reason?: string;
  headers: string[];
}

const KEYWORDS: Record<BankColumnField, string[]> = {
  date: ["date", "transaction date", "value date", "posting date", "trans date", "txn date"],
  narration: ["narration", "description", "particulars", "details", "transaction details", "remarks", "memo"],
  reference: ["reference", "ref", "ref no", "cheque no", "transaction ref", "trans ref", "reference number"],
  debit: ["debit", "withdrawal", "dr", "money out", "debit amount", "debit(ngn)", "debit (ngn)"],
  credit: ["credit", "deposit", "cr", "money in", "credit amount", "credit(ngn)", "credit (ngn)"],
  balance: ["balance", "running balance", "closing balance", "balance(ngn)"],
  amount: ["amount", "transaction amount", "txn amount"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], field: BankColumnField): number | null {
  const normalized = headers.map(normalizeHeader);
  for (const keyword of KEYWORDS[field]) {
    const idx = normalized.findIndex((h) => h === keyword);
    if (idx !== -1) return idx;
  }
  // fall back to substring match if no exact match found
  for (const keyword of KEYWORDS[field]) {
    const idx = normalized.findIndex((h) => h.includes(keyword));
    if (idx !== -1) return idx;
  }
  return null;
}

/**
 * Attempts to auto-detect which column holds which field, given a header row. Does NOT
 * look at data rows — statements vary too much in formatting for that to be reliable
 * without risking a wrong guess, which is worse than asking the user to confirm.
 */
export function detectColumnMapping(headers: string[]): ColumnDetectionResult {
  const mapping: ColumnMapping = {
    date: findColumnIndex(headers, "date"),
    narration: findColumnIndex(headers, "narration"),
    reference: findColumnIndex(headers, "reference"),
    debit: findColumnIndex(headers, "debit"),
    credit: findColumnIndex(headers, "credit"),
    balance: findColumnIndex(headers, "balance"),
    amount: findColumnIndex(headers, "amount"),
  };

  if (mapping.date === null) {
    return { mapping, requiresManualMapping: true, reason: "Could not identify a date column.", headers };
  }

  const hasDebitCredit = mapping.debit !== null || mapping.credit !== null;
  const hasAmount = mapping.amount !== null;
  if (!hasDebitCredit && !hasAmount) {
    return {
      mapping,
      requiresManualMapping: true,
      reason: "Could not identify debit/credit columns or a single signed amount column.",
      headers,
    };
  }

  return { mapping, requiresManualMapping: false, headers };
}
