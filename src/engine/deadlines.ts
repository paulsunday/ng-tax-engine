import { RuleRepository } from "../rules/RuleRepository";
import { Explainable, TaxType } from "../types/common";

type DeadlineBasisRule =
  | { basis: "months_after_period_end"; months: number }
  | { basis: "months_after_incorporation"; months: number }
  | { basis: "months_after_event"; months: number }
  | { basis: "earlier_of"; options: DeadlineBasisRule[] }
  | { basis: "fixed_date"; fixed_date: string } // "MM-DD"
  | { basis: "fixed_day_of_following_month"; dayOfMonth: number };

export interface DeadlineComputationInput {
  taxType: TaxType;
  ruleKey: string;
  jurisdiction: string;
  periodEnd: string; // ISO date — end of the tax/accounting period being filed for
  incorporationDate?: string;
  eventDate?: string; // e.g. cessation date
  pathSelector?: "established_company" | "newly_incorporated" | "ceasing_company"; // picks a sub-rule when value has multiple shapes
}

export interface DeadlineResult extends Explainable {
  statutoryDeadline: string; // ISO date
  filingExtensionExtendsPayment: boolean;
}

/**
 * Statutory deadline engine (brief §16-17). Deliberately generic: every tax type's
 * deadline is DATA (a DeadlineBasisRule), never a hardcoded "21st" baked into this file.
 * The product's "file before the 21st" requirement is implemented one layer up, in
 * buildComplianceCalendarEntry(), which takes the statutory deadline computed here and
 * subtracts an administrator-configured safety margin — it never overrides the statutory
 * date if that date is earlier than the 21st, and never pushes filing later than a later
 * statutory date either (brief §17).
 */
export function computeStatutoryDeadline(
  input: DeadlineComputationInput,
  rules: RuleRepository,
  asOfDate: string
): DeadlineResult {
  const rule = rules.getEffectiveRule<Record<string, DeadlineBasisRule> | DeadlineBasisRule>(
    input.ruleKey,
    input.taxType,
    input.jurisdiction,
    asOfDate
  );

  let basisRule: DeadlineBasisRule;
  let filingExtendsPayment = false;

  if (input.pathSelector && typeof rule.value === "object" && input.pathSelector in (rule.value as object)) {
    basisRule = (rule.value as Record<string, DeadlineBasisRule>)[input.pathSelector];
  } else {
    basisRule = rule.value as DeadlineBasisRule;
  }
  if ("filing_extension_extends_payment" in (rule.value as any)) {
    filingExtendsPayment = (rule.value as any).filing_extension_extends_payment;
  }

  const deadline = resolveBasis(basisRule, input);

  return {
    statutoryDeadline: deadline.toISOString().slice(0, 10),
    filingExtensionExtendsPayment: filingExtendsPayment,
    explanation: `Statutory deadline for ${input.taxType} (${input.ruleKey}) computed as ${deadline.toISOString().slice(0, 10)} per ${rule.sourceReference} of ${rule.sourceDocument}.`,
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [rule.id],
  };
}

function resolveBasis(basis: DeadlineBasisRule, input: DeadlineComputationInput): Date {
  switch (basis.basis) {
    case "months_after_period_end":
      return addMonths(new Date(input.periodEnd), basis.months);
    case "months_after_incorporation":
      if (!input.incorporationDate) throw new Error("incorporationDate required for months_after_incorporation basis");
      return addMonths(new Date(input.incorporationDate), basis.months);
    case "months_after_event":
      if (!input.eventDate) throw new Error("eventDate required for months_after_event basis");
      return addMonths(new Date(input.eventDate), basis.months);
    case "earlier_of":
      return basis.options.map((o) => resolveBasis(o, input)).sort((a, b) => a.getTime() - b.getTime())[0];
    case "fixed_date": {
      const [mm, dd] = basis.fixed_date.split("-").map(Number);
      const periodYear = new Date(input.periodEnd).getFullYear();
      // Annual fixed dates (e.g. PAYE employer return "31 Jan") fall in the January AFTER the period.
      return new Date(Date.UTC(periodYear + 1, mm - 1, dd));
    }
    case "fixed_day_of_following_month": {
      const periodEnd = new Date(input.periodEnd);
      const followingMonth = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, basis.dayOfMonth));
      return followingMonth;
    }
    default:
      throw new Error(`Unsupported deadline basis: ${(basis as any).basis}`);
  }
}

/**
 * Adds months with end-of-month clamping (e.g. 31 Dec + 6 months = 30 Jun, not 1 Jul),
 * matching how "N months after period end" is understood in practice. Naively calling
 * setUTCMonth on a day-31 date would otherwise overflow into the next month whenever the
 * target month is shorter.
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const originalDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return d;
}

// ───────────────────────────── Compliance calendar ─────────────────────────────

export interface ComplianceCalendarInput {
  taxType: TaxType;
  periodLabel: string;
  statutoryDeadline: string; // ISO date, from computeStatutoryDeadline()
  internalSafetyMarginDays: number; // administrator-configured, brief §17
  amountNgn?: number;
  asOfDate: string; // "today" for days-remaining / overdue calculation
}

export interface ComplianceCalendarEntryResult {
  taxType: TaxType;
  periodLabel: string;
  statutoryDeadline: string;
  internalDeadline: string;
  recommendedFilingDate: string;
  daysRemaining: number;
  isOverdue: boolean;
  amountNgn?: number;
}

/**
 * Builds one compliance-calendar entry. The internal deadline is ALWAYS statutoryDeadline
 * minus the safety margin — it can never be later than the statutory deadline, and the
 * statutory deadline itself is whatever computeStatutoryDeadline() returned for this tax
 * (which may be earlier OR later than the 21st — brief §17 explicitly forbids treating the
 * 21st as universal).
 */
export function buildComplianceCalendarEntry(input: ComplianceCalendarInput): ComplianceCalendarEntryResult {
  const statutory = new Date(input.statutoryDeadline);
  const internal = new Date(statutory);
  internal.setUTCDate(internal.getUTCDate() - input.internalSafetyMarginDays);

  const recommended = new Date(internal);
  recommended.setUTCDate(recommended.getUTCDate() - 1); // one extra day of buffer before the internal deadline

  const now = new Date(input.asOfDate);
  const daysRemaining = Math.ceil((statutory.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    taxType: input.taxType,
    periodLabel: input.periodLabel,
    statutoryDeadline: statutory.toISOString().slice(0, 10),
    internalDeadline: internal.toISOString().slice(0, 10),
    recommendedFilingDate: recommended.toISOString().slice(0, 10),
    daysRemaining,
    isOverdue: daysRemaining < 0,
    amountNgn: input.amountNgn,
  };
}
