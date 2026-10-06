import { RuleRepository } from "../rules/RuleRepository";
import { Explainable } from "../types/common";

export type RecipientCategory =
  | "resident_corporate"
  | "nonresident_corporate"
  | "resident_noncorporate"
  | "nonresident_noncorporate";

interface WhtRateTableEntry {
  transaction: string;
  resident_corporate: number | null;
  nonresident_corporate: number | null;
  resident_noncorporate: number | null;
  nonresident_noncorporate: number | null;
  effective_from?: string;
}

interface SmallSupplierExemption {
  max_transaction_value_ngn_per_month: number;
  requires_valid_tin: boolean;
}

export interface WhtTransactionInput {
  transactionCategory: string; // must match a `transaction` key in the WHT rate table
  grossAmountNgn: number;
  cumulativeMonthlyValueWithSameSupplierNgn: number; // for the small-supplier de-minimis test
  recipientCategory: RecipientCategory;
  recipientHasValidTin: boolean;
  supplierIsSmallCompany: boolean; // the PAYER's own small-company status is irrelevant; this is about the entity being paid, per Reg 4(2)
  exemptCategory?: string; // one of wht_exempt_transaction_categories, if applicable
}

export interface WhtDeterminationResult extends Explainable {
  applicable: boolean;
  rateApplied: number | null;
  whtAmountNgn: number;
  netPaymentNgn: number;
  exemptionReason: string | null;
}

/**
 * Withholding Tax determination engine (brief §11).
 * Pipeline: transaction classification -> exemption checks -> rate lookup by recipient
 * category -> no-TIN doubling -> WHT amount -> net payment.
 */
export function determineWht(
  input: WhtTransactionInput,
  rules: RuleRepository,
  asOfDate: string
): WhtDeterminationResult {
  // 1. Explicit Reg 10(1) exemption list.
  if (input.exemptCategory) {
    const exemptRule = rules.getEffectiveRule<string[]>(
      "wht_exempt_transaction_categories",
      "WHT",
      "NG-FEDERAL",
      asOfDate
    );
    if (exemptRule.value.includes(input.exemptCategory)) {
      return noWht(
        input,
        `Exempt from WHT deduction: "${input.exemptCategory}" is listed in ${exemptRule.sourceReference} of ${exemptRule.sourceDocument}. ` +
          `This is an exemption from deduction only, not necessarily from the underlying income tax (Reg 10(2)).`,
        "VERIFIED_CALCULATION",
        [exemptRule.id]
      );
    }
  }

  // 2. Small-supplier de-minimis exemption (Reg 4(2)) — flagged REQUIRES_REVIEW in the
  // research report because its "small company" definition cites the repealed CITA s.105,
  // not NTA s.56. Only even attempted when the supplier is actually flagged as small —
  // otherwise this unresolved rule would block every unrelated transaction from being
  // processed at all, which is not the intent of marking ONE rule requires_review.
  if (input.supplierIsSmallCompany) {
    const smallSupplierRule = rules.tryGetEffectiveRule<SmallSupplierExemption>(
      "wht_small_supplier_exemption",
      "WHT",
      "NG-FEDERAL",
      asOfDate
    );
    if (!smallSupplierRule) {
      return {
        applicable: false,
        rateApplied: null,
        whtAmountNgn: 0,
        netPaymentNgn: round2(input.grossAmountNgn),
        exemptionReason: null,
        explanation:
          `Supplier is flagged small-company, which may trigger a WHT exemption under Reg.4(2), but the rule is not ` +
          `currently activatable (status requires_review) — see research report §8 item 7. Treat as unresolved, not as "no exemption".`,
        confidence: "REQUIRES_REVIEW",
        ruleIdsUsed: [],
      };
    }
    if (
      input.recipientHasValidTin &&
      input.cumulativeMonthlyValueWithSameSupplierNgn <= smallSupplierRule.value.max_transaction_value_ngn_per_month
    ) {
      return noWht(
        input,
        `Exempt under the small-supplier de-minimis rule: supplier holds a valid TIN and cumulative monthly transaction ` +
          `value ₦${input.cumulativeMonthlyValueWithSameSupplierNgn.toLocaleString()} <= ₦${smallSupplierRule.value.max_transaction_value_ngn_per_month.toLocaleString()} ` +
          `(${smallSupplierRule.sourceReference} of ${smallSupplierRule.sourceDocument}). NOTE: this rule's 'small company' definition ` +
          `references the repealed CITA s.105 — mapping to NTA s.56 is unconfirmed, see research report §8 item 7.`,
        "REQUIRES_REVIEW",
        [smallSupplierRule.id]
      );
    }
  }

  // 3. Rate lookup.
  const rateTable = rules.getEffectiveRule<WhtRateTableEntry[]>("wht_rate_table", "WHT", "NG-FEDERAL", asOfDate);
  const entry = rateTable.value.find((e) => e.transaction === input.transactionCategory);
  if (!entry) {
    return {
      applicable: false,
      rateApplied: null,
      whtAmountNgn: 0,
      netPaymentNgn: input.grossAmountNgn,
      exemptionReason: null,
      explanation: `No WHT rate table entry found for transaction category "${input.transactionCategory}" — treat as UNSUPPORTED_SCENARIO, do not assume exemption.`,
      confidence: "UNSUPPORTED_SCENARIO",
      ruleIdsUsed: [rateTable.id],
    };
  }

  const baseRate = entry[input.recipientCategory];
  if (baseRate === null || baseRate === undefined) {
    return noWht(
      input,
      `No WHT applies: the rate table (${rateTable.sourceReference}) specifies N/A for "${input.transactionCategory}" / ${input.recipientCategory}.`,
      "VERIFIED_CALCULATION",
      [rateTable.id]
    );
  }

  // 4. No-TIN doubling (Reg 3(c)) — applies to non-passive-income transactions (goods/services).
  const isNonPassive = !["dividend_interest", "royalty", "rent_hire_lease"].includes(input.transactionCategory);
  const rateApplied = !input.recipientHasValidTin && isNonPassive ? baseRate * 2 : baseRate;

  const whtAmount = input.grossAmountNgn * rateApplied;
  const netPayment = input.grossAmountNgn - whtAmount;

  return {
    applicable: true,
    rateApplied,
    whtAmountNgn: round2(whtAmount),
    netPaymentNgn: round2(netPayment),
    exemptionReason: null,
    explanation:
      `WHT on "${input.transactionCategory}" for ${input.recipientCategory}: base rate ${(baseRate * 100).toFixed(1)}%` +
      (rateApplied !== baseRate
        ? ` doubled to ${(rateApplied * 100).toFixed(1)}% because the recipient has no valid TIN (Reg 3(c))`
        : "") +
      ` per ${rateTable.sourceReference} of ${rateTable.sourceDocument}. WHT = ₦${input.grossAmountNgn.toLocaleString()} × ${(rateApplied * 100).toFixed(1)}% = ₦${round2(whtAmount).toLocaleString()}. Net payment = ₦${round2(netPayment).toLocaleString()}.`,
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [rateTable.id],
  };
}

function noWht(
  input: WhtTransactionInput,
  explanation: string,
  confidence: WhtDeterminationResult["confidence"],
  ruleIdsUsed: string[]
): WhtDeterminationResult {
  return {
    applicable: false,
    rateApplied: 0,
    whtAmountNgn: 0,
    netPaymentNgn: round2(input.grossAmountNgn),
    exemptionReason: explanation,
    explanation,
    confidence,
    ruleIdsUsed,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
