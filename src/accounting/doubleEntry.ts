/**
 * Pure double-entry validation (master-build-prompt §6: "The system must prevent
 * unbalanced journal entries. Debit total must equal credit total.").
 *
 * Deliberately framework- and database-agnostic, like src/engine/* for the tax domain —
 * this is called from the NestJS service layer (src/api/accounting/journal.service.ts)
 * before anything is written to the DB, and is unit-testable without Prisma/Nest at all.
 */

export interface JournalLineInput {
  accountId: string;
  debitNgn: number;
  creditNgn: number;
  description?: string;
}

export class UnbalancedJournalEntryError extends Error {
  constructor(totalDebit: number, totalCredit: number) {
    super(`Journal entry is unbalanced: total debit ₦${totalDebit.toLocaleString()} != total credit ₦${totalCredit.toLocaleString()}.`);
    this.name = "UnbalancedJournalEntryError";
  }
}

export class InvalidJournalLineError extends Error {}

const EPSILON = 0.005; // half a kobo — tolerate float rounding, not real imbalance

/**
 * Validates a proposed set of journal lines. Throws on the first problem found rather
 * than returning a result object, because an invalid journal entry must never be
 * persisted under any circumstance — there is no "warn and continue" path here.
 */
export function validateJournalLines(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new InvalidJournalLineError("A journal entry must have at least two lines (one debit, one credit).");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (line.debitNgn < 0 || line.creditNgn < 0) {
      throw new InvalidJournalLineError("Debit/credit amounts cannot be negative.");
    }
    const hasDebit = line.debitNgn > 0;
    const hasCredit = line.creditNgn > 0;
    if (hasDebit === hasCredit) {
      // both zero, or both non-zero — a single ledger line must be exactly one or the other
      throw new InvalidJournalLineError(
        `Journal line for account "${line.accountId}" must have exactly one of debit/credit > 0 ` +
          `(got debit=${line.debitNgn}, credit=${line.creditNgn}).`
      );
    }
    totalDebit += line.debitNgn;
    totalCredit += line.creditNgn;
  }

  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    throw new UnbalancedJournalEntryError(round2(totalDebit), round2(totalCredit));
  }
}

export function sumDebits(lines: JournalLineInput[]): number {
  return round2(lines.reduce((acc, l) => acc + l.debitNgn, 0));
}

export function sumCredits(lines: JournalLineInput[]): number {
  return round2(lines.reduce((acc, l) => acc + l.creditNgn, 0));
}

/**
 * Builds the reversing lines for a posted entry being voided (brief §11/§41: never edit
 * or delete a posted entry — reverse it instead). Simply swaps debit and credit per line.
 */
export function buildReversalLines(originalLines: JournalLineInput[]): JournalLineInput[] {
  return originalLines.map((l) => ({
    accountId: l.accountId,
    debitNgn: l.creditNgn,
    creditNgn: l.debitNgn,
    description: l.description ? `Reversal: ${l.description}` : "Reversal",
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
