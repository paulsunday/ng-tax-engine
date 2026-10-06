import { RuleRepository } from "../rules/RuleRepository";
import { ApplicabilityResult, CompanyProfile } from "../types/common";
import { classifySmallCompany } from "./classification";

/**
 * Tax Applicability Engine (brief §7).
 * Given a company profile, decides which taxes apply and WHY — never a blanket
 * "apply everything." Each result cites the rule(s) and the specific profile facts
 * that drove the decision, so a reviewer can see the reasoning, not just the verdict.
 */
export function determineApplicableTaxes(
  company: CompanyProfile,
  rules: RuleRepository,
  asOfDate: string
): ApplicabilityResult[] {
  const results: ApplicabilityResult[] = [];
  const smallCo = classifySmallCompany(company, rules, asOfDate);

  // --- CIT: always applicable to a company with Nigerian-taxable profits; the small-company
  // classification changes the RATE (handled in the CIT engine), not whether CIT applies at all.
  results.push({
    taxType: "CIT",
    applicable: true,
    reason:
      `Companies Income Tax identified as applicable because ${company.name} is a company chargeable to tax on its ` +
      `profits under the Nigeria Tax Act 2025 (every company must file, even if the computed liability is zero for a ` +
      `small company) — NTAA s.11(1).`,
    confidence: "VERIFIED_RULE",
    ruleIdsUsed: smallCo.ruleIdsUsed,
  });

  // --- Development Levy: excluded for small companies and non-residents (NTA s.59(1)).
  if (smallCo.isSmallCompany) {
    results.push({
      taxType: "DEVELOPMENT_LEVY",
      applicable: false,
      reason: `Development Levy does not apply: ${smallCo.explanation} Small companies are explicitly excluded by NTA s.59(1).`,
      confidence: "VERIFIED_RULE",
      ruleIdsUsed: smallCo.ruleIdsUsed,
    });
  } else if (!company.isResident) {
    results.push({
      taxType: "DEVELOPMENT_LEVY",
      applicable: false,
      reason: `Development Levy does not apply: ${company.name} is a non-resident company, explicitly excluded by NTA s.59(1).`,
      confidence: "VERIFIED_RULE",
      ruleIdsUsed: [],
    });
  } else {
    results.push({
      taxType: "DEVELOPMENT_LEVY",
      applicable: true,
      reason: `Development Levy identified as applicable: ${company.name} is a resident company that is not a small company, per NTA s.59(1).`,
      confidence: "VERIFIED_RULE",
      ruleIdsUsed: smallCo.ruleIdsUsed,
    });
  }

  // --- VAT: small businesses are exempt from registration/monthly filing (NTAA s.22(4)) unless
  // they opt in; this numeric linkage to the small-company test is flagged requires_review
  // in the research report, so the applicability verdict itself is downgraded accordingly.
  if (smallCo.isSmallCompany && !company.vatRegisteredVoluntarily) {
    results.push({
      taxType: "VAT",
      applicable: false,
      reason:
        `VAT monthly filing not required: ${company.name} falls within the small-business exemption (NTAA s.22(4)) and ` +
        `has not elected to opt in under s.22(5). NOTE: the numeric turnover threshold used for this VAT exemption test ` +
        `is assumed to equal the NTA s.56 small-company test but is not independently restated in the VAT provisions — ` +
        `treat this verdict as requiring confirmation, see REGULATORY_RESEARCH_REPORT.md §8 item 1.`,
      confidence: "REQUIRES_REVIEW",
      ruleIdsUsed: smallCo.ruleIdsUsed,
    });
  } else {
    results.push({
      taxType: "VAT",
      applicable: true,
      reason: company.vatRegisteredVoluntarily
        ? `VAT identified as applicable: ${company.name} has voluntarily opted into VAT registration under NTAA s.22(5).`
        : `VAT identified as applicable because ${company.name}'s activities fall within the applicable VAT framework and it exceeds the small-business exemption, per NTAA s.22(1).`,
      confidence: smallCo.isSmallCompany ? "REQUIRES_REVIEW" : "VERIFIED_RULE",
      ruleIdsUsed: smallCo.ruleIdsUsed,
    });
  }

  // --- WHT: applicability is transaction-level, not company-level — see determineWht() in wht.ts.
  // At the company-profile level we can only say the obligation framework potentially applies.
  results.push({
    taxType: "WHT",
    applicable: true,
    reason:
      `Withholding Tax identified as potentially applicable because ${company.name} is a body corporate and therefore ` +
      `a person required to deduct tax at source on eligible transactions under Deduction of Tax at Source (Withholding) ` +
      `Regulations 2024, reg.4(1)(a). Actual applicability must be assessed per transaction — see the WHT engine.`,
    confidence: "VERIFIED_RULE",
    ruleIdsUsed: [],
  });

  // --- PAYE: applicable only if the company has employees.
  if (company.employeeCount > 0) {
    results.push({
      taxType: "PAYE",
      applicable: true,
      reason: `PAYE identified as applicable because ${company.name} has ${company.employeeCount} employee(s) subject to payroll taxation under NTA s.58 / NTAA s.14.`,
      confidence: "VERIFIED_RULE",
      ruleIdsUsed: [],
    });
  } else {
    results.push({
      taxType: "PAYE",
      applicable: false,
      reason: `PAYE does not apply: ${company.name} has no employees on record.`,
      confidence: "VERIFIED_RULE",
      ruleIdsUsed: [],
    });
  }

  return results;
}
