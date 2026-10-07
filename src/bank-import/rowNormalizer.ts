import { ColumnMapping } from "./columnMapping";

export interface NormalizedBankRow {
  date: string; // ISO yyyy-mm-dd
  narration: string;
  reference: string | null;
  debitNgn: number;
  creditNgn: number;
  balanceAfterNgn: number | null;
}

export interface RowNormalizationError {
  rowIndex: number;
  reason: string;
  raw: string[];
}

export interface RowNormalizationResult {
  rows: NormalizedBankRow[];
  errors: RowNormalizationError[];
}

/**
 * Parses a date cell from a bank statement. Nigerian bank statements are overwhelmingly
 * DD/MM/YYYY or DD-MM-YYYY (not the US MM/DD/YYYY convention) — this is a documented
 * assumption, not a silent guess, and ISO yyyy-mm-dd is tried first since it's unambiguous.
 */
function parseStatementDate(raw: string): string | null {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmy) {
    const [, d, m] = dmy;
    let y = dmy[3];
    if (y.length === 2) y = `20${y}`;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    if (Number(month) > 12) return null; // not actually DD/MM — ambiguous, reject rather than guess
    return `${y}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[,₦\s]/g, "").replace(/^\((.*)\)$/, "-$1"); // "(1,000.00)" -> "-1000.00"
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

export function normalizeRows(rawRows: string[][], mapping: ColumnMapping): RowNormalizationResult {
  const rows: NormalizedBankRow[] = [];
  const errors: RowNormalizationError[] = [];

  rawRows.forEach((raw, rowIndex) => {
    const get = (col: number | null) => (col !== null && col < raw.length ? raw[col] : undefined);

    const dateCell = get(mapping.date);
    if (!dateCell) {
      errors.push({ rowIndex, reason: "Missing date value.", raw });
      return;
    }
    const date = parseStatementDate(dateCell);
    if (!date) {
      errors.push({ rowIndex, reason: `Could not parse date "${dateCell}".`, raw });
      return;
    }

    let debitNgn = 0;
    let creditNgn = 0;
    if (mapping.debit !== null || mapping.credit !== null) {
      // Dedicated debit/credit columns are magnitudes by convention — a parenthesised or
      // otherwise negative-looking value in one of these columns still means "this many
      // naira", not a sign flip (that's what the separate amount-column branch is for).
      debitNgn = Math.abs(parseAmount(get(mapping.debit)));
      creditNgn = Math.abs(parseAmount(get(mapping.credit)));
    } else if (mapping.amount !== null) {
      const amount = parseAmount(get(mapping.amount));
      if (amount < 0) debitNgn = Math.abs(amount);
      else creditNgn = amount;
    }

    if (debitNgn === 0 && creditNgn === 0) {
      errors.push({ rowIndex, reason: "Both debit and credit resolved to zero — skipping.", raw });
      return;
    }

    const balanceCell = get(mapping.balance);
    rows.push({
      date,
      narration: get(mapping.narration)?.trim() ?? "",
      reference: get(mapping.reference)?.trim() || null,
      debitNgn: round2(debitNgn),
      creditNgn: round2(creditNgn),
      balanceAfterNgn: balanceCell ? round2(parseAmount(balanceCell)) : null,
    });
  });

  return { rows, errors };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
