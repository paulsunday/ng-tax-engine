/**
 * Pure audit-finding detectors (master-build-prompt §10). Every detector returns
 * findings using neutral, non-accusatory language — "potential anomaly", "requires
 * review" — never a fraud accusation (brief §10: "The system must not automatically
 * accuse a user of fraud"). These are statistical/rule-based heuristics, not proof of
 * anything; a human must review every finding.
 */

export type FindingCategory =
  | "DUPLICATE_TRANSACTION"
  | "MISSING_DOCUMENTATION"
  | "UNUSUAL_TRANSACTION"
  | "LARGE_TRANSACTION"
  | "ROUND_NUMBER_ANOMALY"
  | "UNRECONCILED_BANK_TRANSACTION"
  | "TAX_CONSISTENCY"
  | "PERIOD_CUTOFF"
  | "REPEATED_VENDOR_OR_CUSTOMER"
  | "UNBALANCED_LEDGER";

export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface DetectedFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  description: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface TransactionLike {
  id: string;
  entityType: string;
  amountNgn: number;
  date: Date;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  hasDocument: boolean;
  createdAt: Date;
}

/** Same amount + same counterparty within a short window — a common duplicate-payment pattern. */
export function detectDuplicateTransactions(transactions: TransactionLike[], windowDays = 7): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  for (let i = 0; i < transactions.length; i++) {
    for (let j = i + 1; j < transactions.length; j++) {
      const a = transactions[i];
      const b = transactions[j];
      if (!a.counterpartyId || a.counterpartyId !== b.counterpartyId) continue;
      if (Math.abs(a.amountNgn - b.amountNgn) > 0.01) continue;
      const daysApart = Math.abs(a.date.getTime() - b.date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysApart > windowDays) continue;

      findings.push({
        category: "DUPLICATE_TRANSACTION",
        severity: "MEDIUM",
        description: `Potential duplicate: two ${a.entityType} transactions of ₦${a.amountNgn.toLocaleString()} with ${a.counterpartyName ?? "the same counterparty"}, ${Math.round(daysApart)} day(s) apart. Requires review.`,
        relatedEntityType: a.entityType,
        relatedEntityId: a.id,
      });
    }
  }
  return findings;
}

export function detectMissingDocumentation(transactions: TransactionLike[]): DetectedFinding[] {
  return transactions
    .filter((t) => !t.hasDocument)
    .map((t) => ({
      category: "MISSING_DOCUMENTATION",
      severity: "LOW" as FindingSeverity,
      description: `${t.entityType} of ₦${t.amountNgn.toLocaleString()} dated ${t.date.toISOString().slice(0, 10)} has no supporting document attached. Supporting documentation required.`,
      relatedEntityType: t.entityType,
      relatedEntityId: t.id,
    }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Flags transactions materially larger than the typical transaction in the same set — needs a reasonable sample size to be meaningful. */
export function detectLargeTransactions(transactions: TransactionLike[], multiple = 3, minimumSampleSize = 5): DetectedFinding[] {
  if (transactions.length < minimumSampleSize) return [];
  const med = median(transactions.map((t) => t.amountNgn));
  if (med <= 0) return [];

  return transactions
    .filter((t) => t.amountNgn > med * multiple)
    .map((t) => ({
      category: "LARGE_TRANSACTION" as FindingCategory,
      severity: "MEDIUM" as FindingSeverity,
      description: `${t.entityType} of ₦${t.amountNgn.toLocaleString()} is more than ${multiple}x the period's median transaction (₦${median(transactions.map((x) => x.amountNgn)).toLocaleString()}). Unusual transaction — requires review.`,
      relatedEntityType: t.entityType,
      relatedEntityId: t.id,
    }));
}

/** Suspiciously round, materially-sized amounts (e.g. an exact ₦500,000) are worth a second look, not an accusation. */
export function detectRoundNumberAnomalies(transactions: TransactionLike[], roundnessDivisor = 100_000, minimumAmount = 100_000): DetectedFinding[] {
  return transactions
    .filter((t) => t.amountNgn >= minimumAmount && t.amountNgn % roundnessDivisor === 0)
    .map((t) => ({
      category: "ROUND_NUMBER_ANOMALY" as FindingCategory,
      severity: "LOW" as FindingSeverity,
      description: `${t.entityType} of exactly ₦${t.amountNgn.toLocaleString()} is a suspiciously round figure for its size. Potential anomaly — requires review, not an accusation of wrongdoing.`,
      relatedEntityType: t.entityType,
      relatedEntityId: t.id,
    }));
}

/** A counterparty responsible for an outsized share of transaction volume, relative to the rest. */
export function detectRepeatedCounterparty(transactions: TransactionLike[], concentrationThreshold = 0.4, minimumTransactionCount = 5): DetectedFinding[] {
  if (transactions.length < minimumTransactionCount) return [];
  const counts = new Map<string, { count: number; name: string }>();
  for (const t of transactions) {
    if (!t.counterpartyId) continue;
    const existing = counts.get(t.counterpartyId) ?? { count: 0, name: t.counterpartyName ?? t.counterpartyId };
    existing.count++;
    counts.set(t.counterpartyId, existing);
  }

  const findings: DetectedFinding[] = [];
  for (const [counterpartyId, { count, name }] of counts) {
    const share = count / transactions.length;
    if (share >= concentrationThreshold) {
      findings.push({
        category: "REPEATED_VENDOR_OR_CUSTOMER",
        severity: "LOW",
        description: `${name} accounts for ${Math.round(share * 100)}% (${count}/${transactions.length}) of this period's transactions — an unusually high concentration. Requires review, not necessarily an issue.`,
        relatedEntityType: "Counterparty",
        relatedEntityId: counterpartyId,
      });
    }
  }
  return findings;
}

/** A transaction recorded materially later than the date it claims — worth checking for backdating or late entry, not accusing anyone. */
export function detectPeriodCutoffIssues(transactions: TransactionLike[], maxLagDays = 30): DetectedFinding[] {
  return transactions
    .filter((t) => (t.createdAt.getTime() - t.date.getTime()) / (1000 * 60 * 60 * 24) > maxLagDays)
    .map((t) => ({
      category: "PERIOD_CUTOFF" as FindingCategory,
      severity: "LOW" as FindingSeverity,
      description: `${t.entityType} dated ${t.date.toISOString().slice(0, 10)} was recorded ${Math.round((t.createdAt.getTime() - t.date.getTime()) / 86400000)} days later. Potential cutoff issue — requires review.`,
      relatedEntityType: t.entityType,
      relatedEntityId: t.id,
    }));
}

export function checkTaxConsistency(invoiceVatTotalNgn: number, vatPayableAccountMovementNgn: number, toleranceNgn = 1): DetectedFinding[] {
  const difference = Math.abs(invoiceVatTotalNgn - vatPayableAccountMovementNgn);
  if (difference <= toleranceNgn) return [];
  return [
    {
      category: "TAX_CONSISTENCY",
      severity: "MEDIUM",
      description: `VAT on posted invoices (₦${invoiceVatTotalNgn.toLocaleString()}) does not match the VAT Payable account's movement (₦${vatPayableAccountMovementNgn.toLocaleString()}) for the period — a difference of ₦${difference.toLocaleString()}. Requires review.`,
    },
  ];
}

export function checkLedgerBalance(totalDebitNgn: number, totalCreditNgn: number): DetectedFinding[] {
  if (Math.abs(totalDebitNgn - totalCreditNgn) <= 0.01) return [];
  return [
    {
      category: "UNBALANCED_LEDGER",
      severity: "HIGH",
      description: `Trial balance does not balance: total debits ₦${totalDebitNgn.toLocaleString()} vs total credits ₦${totalCreditNgn.toLocaleString()}. This should never happen if all entries were posted through the journal engine — investigate immediately.`,
    },
  ];
}
