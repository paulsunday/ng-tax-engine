import { RuleRepository } from "../rules/RuleRepository";
import { CompanyProfile, ConfidenceLevel, Explainable } from "../types/common";
import { classifySmallCompany } from "./classification";

export interface CitComputationInput {
  accountingProfitNgn: number;
  nonDeductibleExpensesNgn: number; // add-backs (disallowed depreciation, fines, etc.)
  nonTaxableIncomeNgn: number; // deductions (exempt income included in accounting profit)
  totalCapitalAllowanceNgn: number; // from capitalAllowance.ts, summed across assets
  totalLossReliefNgn: number; // from taxLoss.ts
}

export interface CitComputationResult extends Explainable {
  companyName: string;
  accountingProfitNgn: number;
  taxableAdditionsNgn: number;
  allowableDeductionsNgn: number;
  assessableProfitNgn: number; // accounting profit + additions - deductions, BEFORE capital allowance/loss
  capitalAllowanceNgn: number;
  lossReliefNgn: number;
  totalProfitNgn: number; // = taxable profit, per NTA s.27(1) terminology
  effectiveRate: number;
  taxLiabilityNgn: number;
  isSmallCompany: boolean;
  breakdown: Record<string, number | string | boolean>;
}

/**
 * Companies Income Tax engine.
 * Formula (NTA s.27(1), s.56):
 *   Accounting Profit
 *   + Taxable additions (non-deductible expenses)
 *   − Allowable deductions (non-taxable income included in accounting profit)
 *   = Assessable profit                         <- this is the DEVELOPMENT LEVY base (NTA s.59)
 *   − Capital allowances (First Schedule Part I)
 *   − Loss relief (s.27(5))
 *   = Total/Taxable profit                      <- this is the CIT base (NTA s.56)
 *   × Rate (0% small company / 30% standard)
 *   = Tax liability
 */
export function computeCit(
  company: CompanyProfile,
  input: CitComputationInput,
  rules: RuleRepository,
  asOfDate: string
): CitComputationResult {
  const smallCo = classifySmallCompany(company, rules, asOfDate);

  const rateRuleKey = smallCo.isSmallCompany ? "cit_small_company_rate" : "cit_standard_rate";
  const rateRule = rules.getEffectiveRule<number>(rateRuleKey, "CIT", "NG-FEDERAL", asOfDate);

  const assessableProfit =
    input.accountingProfitNgn + input.nonDeductibleExpensesNgn - input.nonTaxableIncomeNgn;

  const afterCapitalAllowance = assessableProfit - input.totalCapitalAllowanceNgn;
  const totalProfit = Math.max(afterCapitalAllowance - input.totalLossReliefNgn, 0);

  const taxLiability = totalProfit * rateRule.value;

  const confidence: ConfidenceLevel = smallCo.confidence === "VERIFIED_RULE" ? "VERIFIED_CALCULATION" : "REQUIRES_REVIEW";

  const explanation =
    `${company.name}: Accounting profit ₦${input.accountingProfitNgn.toLocaleString()} + additions ₦${input.nonDeductibleExpensesNgn.toLocaleString()} ` +
    `− deductions ₦${input.nonTaxableIncomeNgn.toLocaleString()} = assessable profit ₦${assessableProfit.toLocaleString()}. ` +
    `Less capital allowance ₦${input.totalCapitalAllowanceNgn.toLocaleString()} and loss relief ₦${input.totalLossReliefNgn.toLocaleString()} ` +
    `= total profit ₦${totalProfit.toLocaleString()}. ${smallCo.explanation} Rate applied: ${(rateRule.value * 100).toFixed(0)}% ` +
    `per ${rateRule.sourceReference} of ${rateRule.sourceDocument}. Tax liability = ₦${taxLiability.toLocaleString()}.`;

  return {
    companyName: company.name,
    accountingProfitNgn: round2(input.accountingProfitNgn),
    taxableAdditionsNgn: round2(input.nonDeductibleExpensesNgn),
    allowableDeductionsNgn: round2(input.nonTaxableIncomeNgn),
    assessableProfitNgn: round2(assessableProfit),
    capitalAllowanceNgn: round2(input.totalCapitalAllowanceNgn),
    lossReliefNgn: round2(input.totalLossReliefNgn),
    totalProfitNgn: round2(totalProfit),
    effectiveRate: rateRule.value,
    taxLiabilityNgn: round2(taxLiability),
    isSmallCompany: smallCo.isSmallCompany,
    breakdown: {
      accountingProfitNgn: round2(input.accountingProfitNgn),
      "+ taxableAdditionsNgn": round2(input.nonDeductibleExpensesNgn),
      "- allowableDeductionsNgn": round2(input.nonTaxableIncomeNgn),
      "= assessableProfitNgn": round2(assessableProfit),
      "- capitalAllowanceNgn": round2(input.totalCapitalAllowanceNgn),
      "- lossReliefNgn": round2(input.totalLossReliefNgn),
      "= totalProfitNgn": round2(totalProfit),
      "x rate": rateRule.value,
      "= taxLiabilityNgn": round2(taxLiability),
      isSmallCompany: smallCo.isSmallCompany,
    },
    explanation,
    confidence,
    ruleIdsUsed: [...smallCo.ruleIdsUsed, rateRule.id],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
