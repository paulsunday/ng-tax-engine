import { RuleRepository } from "../rules/RuleRepository";
import { CompanyProfile, Explainable } from "../types/common";

interface SmallCompanyThreshold {
  max_turnover_ngn: number;
  max_fixed_assets_ngn: number;
  excludes_professional_services: boolean;
}

export interface ClassificationResult extends Explainable {
  isSmallCompany: boolean;
}

/**
 * Determines small-company status per NTA 2025 s.56. This single function is the only
 * place that threshold test should ever be implemented — every downstream engine (CIT,
 * Development Levy, VAT, WHT small-supplier exemption) must call this rather than
 * re-implementing the turnover/asset comparison themselves.
 */
export function classifySmallCompany(
  company: CompanyProfile,
  rules: RuleRepository,
  asOfDate: string
): ClassificationResult {
  const rule = rules.getEffectiveRule<SmallCompanyThreshold>(
    "small_company_threshold",
    "CIT",
    "NG-FEDERAL",
    asOfDate
  );

  if (company.isProfessionalServices) {
    return {
      isSmallCompany: false,
      explanation:
        `${company.name} is excluded from small-company classification because it provides professional services, ` +
        `regardless of turnover, per ${rule.sourceReference} of ${rule.sourceDocument}.`,
      confidence: "VERIFIED_RULE",
      ruleIdsUsed: [rule.id],
    };
  }

  const withinTurnover = company.turnoverNgn <= rule.value.max_turnover_ngn;
  const withinAssets = company.fixedAssetsNgn <= rule.value.max_fixed_assets_ngn;
  const isSmall = withinTurnover && withinAssets;

  return {
    isSmallCompany: isSmall,
    explanation: isSmall
      ? `${company.name} qualifies as a small company: turnover ₦${company.turnoverNgn.toLocaleString()} <= ` +
        `₦${rule.value.max_turnover_ngn.toLocaleString()} and fixed assets ₦${company.fixedAssetsNgn.toLocaleString()} <= ` +
        `₦${rule.value.max_fixed_assets_ngn.toLocaleString()}, per ${rule.sourceReference} of ${rule.sourceDocument}.`
      : `${company.name} does not qualify as a small company: turnover ₦${company.turnoverNgn.toLocaleString()} or fixed ` +
        `assets ₦${company.fixedAssetsNgn.toLocaleString()} exceed the thresholds in ${rule.sourceReference} of ${rule.sourceDocument}.`,
    confidence: "VERIFIED_RULE",
    ruleIdsUsed: [rule.id],
  };
}
