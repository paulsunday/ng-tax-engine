import { RuleRepository } from "../rules/RuleRepository";
import { CompanyProfile, Explainable } from "../types/common";
import { classifySmallCompany } from "./classification";

export interface VatPeriodInput {
  taxableSuppliesNgn: number; // value of all taxable supplies for the period, excl. VAT
  recoverableInputVatNgn: number;
  nonRecoverableInputVatNgn: number; // tracked for transparency; never nets against output VAT
  nonResidentSelfWithheldVatNgn?: number; // VAT self-withheld on inbound non-resident supplies (NTA s.150(2))
}

export interface VatComputationResult extends Explainable {
  registrationRequired: boolean;
  outputVatNgn: number;
  recoverableInputVatNgn: number;
  nonRecoverableInputVatNgn: number;
  vatPayableOrCreditNgn: number; // positive = payable, negative = credit carried forward
  nonResidentSelfWithheldVatNgn: number;
}

/**
 * VAT engine: Output VAT − recoverable input VAT (+ any self-withheld VAT on inbound
 * non-resident supplies, which is remitted directly rather than netted) = payable/credit.
 * Rate: NTA s.148. Small-business exemption: NTAA s.22(4) — see applicability.ts for the
 * REQUIRES_REVIEW flag on the numeric threshold linkage.
 */
export function computeVat(
  company: CompanyProfile,
  input: VatPeriodInput,
  rules: RuleRepository,
  asOfDate: string
): VatComputationResult {
  const smallCo = classifySmallCompany(company, rules, asOfDate);
  const registrationRequired = !smallCo.isSmallCompany || company.vatRegisteredVoluntarily;

  const rateRule = rules.getEffectiveRule<number>("vat_standard_rate", "VAT", "NG-FEDERAL", asOfDate);
  const outputVat = input.taxableSuppliesNgn * rateRule.value;
  const selfWithheld = input.nonResidentSelfWithheldVatNgn ?? 0;
  const payableOrCredit = outputVat - input.recoverableInputVatNgn + selfWithheld;

  if (!registrationRequired) {
    return {
      registrationRequired: false,
      outputVatNgn: 0,
      recoverableInputVatNgn: 0,
      nonRecoverableInputVatNgn: round2(input.nonRecoverableInputVatNgn),
      vatPayableOrCreditNgn: 0,
      nonResidentSelfWithheldVatNgn: round2(selfWithheld),
      explanation: `VAT not computed: ${smallCo.explanation} Small businesses are exempt from VAT registration/filing under NTAA s.22(4) unless they opt in (REQUIRES_REVIEW on the numeric threshold linkage — see research report §8).`,
      confidence: "REQUIRES_REVIEW",
      ruleIdsUsed: smallCo.ruleIdsUsed,
    };
  }

  return {
    registrationRequired: true,
    outputVatNgn: round2(outputVat),
    recoverableInputVatNgn: round2(input.recoverableInputVatNgn),
    nonRecoverableInputVatNgn: round2(input.nonRecoverableInputVatNgn),
    vatPayableOrCreditNgn: round2(payableOrCredit),
    nonResidentSelfWithheldVatNgn: round2(selfWithheld),
    explanation:
      `Output VAT = ₦${input.taxableSuppliesNgn.toLocaleString()} × ${(rateRule.value * 100).toFixed(1)}% = ₦${round2(outputVat).toLocaleString()} ` +
      `(${rateRule.sourceReference} of ${rateRule.sourceDocument}). Less recoverable input VAT ₦${input.recoverableInputVatNgn.toLocaleString()}` +
      (selfWithheld > 0 ? ` plus self-withheld VAT on non-resident supplies ₦${selfWithheld.toLocaleString()} (NTA s.150(2))` : "") +
      ` = ${payableOrCredit >= 0 ? "payable" : "credit"} ₦${Math.abs(round2(payableOrCredit)).toLocaleString()}. ` +
      `Non-recoverable input VAT of ₦${input.nonRecoverableInputVatNgn.toLocaleString()} is tracked but not deducted.`,
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [rateRule.id, ...smallCo.ruleIdsUsed],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
