import { RuleRepository } from "../rules/RuleRepository";
import { CompanyProfile, Explainable } from "../types/common";
import { classifySmallCompany } from "./classification";

export interface DevelopmentLevyResult extends Explainable {
  applicable: boolean;
  assessableProfitNgn: number;
  rate: number;
  levyLiabilityNgn: number;
}

/**
 * Development Levy — modelled as an INDEPENDENT levy (brief §13), not folded into CIT.
 * Base is assessable profit (pre capital-allowance/loss, NTA s.59(1)) — distinct from the
 * CIT base, which is total/taxable profit after those deductions (NTA s.56). Do not reuse
 * the CIT taxable-profit figure here; that would understate the levy.
 */
export function computeDevelopmentLevy(
  company: CompanyProfile,
  assessableProfitNgn: number,
  rules: RuleRepository,
  asOfDate: string
): DevelopmentLevyResult {
  const smallCo = classifySmallCompany(company, rules, asOfDate);

  if (smallCo.isSmallCompany || !company.isResident) {
    const reason = smallCo.isSmallCompany
      ? smallCo.explanation
      : `${company.name} is a non-resident company.`;
    return {
      applicable: false,
      assessableProfitNgn: round2(assessableProfitNgn),
      rate: 0,
      levyLiabilityNgn: 0,
      explanation: `Development Levy not applicable: ${reason} Small companies and non-resident companies are excluded under NTA s.59(1).`,
      confidence: "VERIFIED_CALCULATION",
      ruleIdsUsed: smallCo.ruleIdsUsed,
    };
  }

  const rateRule = rules.getEffectiveRule<number>("development_levy_rate", "DEVELOPMENT_LEVY", "NG-FEDERAL", asOfDate);
  const levy = assessableProfitNgn * rateRule.value;

  return {
    applicable: true,
    assessableProfitNgn: round2(assessableProfitNgn),
    rate: rateRule.value,
    levyLiabilityNgn: round2(levy),
    explanation:
      `Development Levy = ₦${assessableProfitNgn.toLocaleString()} assessable profit × ${(rateRule.value * 100).toFixed(0)}% ` +
      `= ₦${round2(levy).toLocaleString()}, per ${rateRule.sourceReference} of ${rateRule.sourceDocument}. Note: this uses ` +
      `assessable profit (before capital allowances/loss relief), not the CIT taxable-profit figure.`,
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [rateRule.id, ...smallCo.ruleIdsUsed],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
