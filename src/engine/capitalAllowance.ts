import { RuleRepository } from "../rules/RuleRepository";
import { Explainable } from "../types/common";

export interface CapitalAssetInput {
  id: string;
  description: string;
  assetClass: 1 | 2 | 3;
  qualifyingExpenditureNgn: number;
  acquisitionDate: string;
  disposalDate?: string | null;
  businessUsePercent: number; // 0-100
  nonTaxableIncomePercentOfTotalIncome?: number; // for the s.27(3)-(4) proration carve-out
  /** Allowance already claimed in prior years, i.e. qualifying expenditure minus opening residue. */
  priorAllowanceClaimedNgn: number;
}

interface CapitalAllowanceTableEntry {
  class: 1 | 2 | 3;
  rate: number;
  assets: string[];
}

export interface CapitalAllowanceClaimResult extends Explainable {
  assetId: string;
  openingResidueNgn: number;
  grossAllowanceNgn: number;
  allowanceClaimedNgn: number; // after proration for partial business use / partial period
  notionalResidueNgn: number; // 1% statistical retention — never changes claimable amount
  closingResidueNgn: number;
}

/**
 * Tax capital allowance register — deliberately independent of any accounting depreciation
 * schedule (brief §14: "must NOT automatically be treated as the same thing").
 * Rates: NTA First Schedule Part I Table I. No initial allowance exists under NTA 2025 —
 * only the single annual allowance computed here.
 */
export function computeCapitalAllowanceForYear(
  asset: CapitalAssetInput,
  yearOfAssessment: number,
  basisPeriodDays: number,
  fullYearDays: number,
  rules: RuleRepository,
  asOfDate: string
): CapitalAllowanceClaimResult {
  const rule = rules.getEffectiveRule<CapitalAllowanceTableEntry[]>(
    "capital_allowance_table_1",
    "CAPITAL_ALLOWANCE",
    "NG-FEDERAL",
    asOfDate
  );
  const classEntry = rule.value.find((e) => e.class === asset.assetClass);
  if (!classEntry) {
    throw new Error(`No capital allowance table entry found for asset class ${asset.assetClass}`);
  }

  const openingResidue = asset.qualifyingExpenditureNgn - asset.priorAllowanceClaimedNgn;
  const grossAllowance = asset.qualifyingExpenditureNgn * classEntry.rate;

  const isShortPeriod = basisPeriodDays < fullYearDays;
  const periodProrated = isShortPeriod ? grossAllowance * (basisPeriodDays / fullYearDays) : grossAllowance;

  // s.27(3)-(4): prorate for partial business use UNLESS non-taxable income is < 10% of total income.
  const skipUseProration = (asset.nonTaxableIncomePercentOfTotalIncome ?? 0) < 10;
  const useProrated = skipUseProration ? periodProrated : periodProrated * (asset.businessUsePercent / 100);

  const allowanceClaimed = Math.min(useProrated, openingResidue);
  const notionalResidue = asset.qualifyingExpenditureNgn * 0.01;
  const closingResidue = Math.max(openingResidue - allowanceClaimed, 0);

  const reasons: string[] = [
    `Asset class ${asset.assetClass} ("${classEntry.assets.join(", ")}") attracts ${(classEntry.rate * 100).toFixed(0)}% per annum under ${rule.sourceReference} of ${rule.sourceDocument}.`,
    `Gross allowance = ₦${asset.qualifyingExpenditureNgn.toLocaleString()} × ${(classEntry.rate * 100).toFixed(0)}% = ₦${grossAllowance.toLocaleString()}.`,
  ];
  if (isShortPeriod) {
    reasons.push(`Prorated for a ${basisPeriodDays}/${fullYearDays}-day basis period (NTA First Schedule Part I para 6(b)).`);
  }
  if (!skipUseProration) {
    reasons.push(
      `Further prorated to ${asset.businessUsePercent}% business use because non-taxable income is >=10% of total income (NTA s.27(3)).`
    );
  } else if ((asset.nonTaxableIncomePercentOfTotalIncome ?? 0) > 0) {
    reasons.push(`Business-use proration skipped: non-taxable income is <10% of total income (NTA s.27(4)).`);
  }
  reasons.push(`Capped at opening residue of ₦${openingResidue.toLocaleString()}; 1% notional residue (₦${notionalResidue.toLocaleString()}) recorded for statistics only and does not reduce the claim.`);

  return {
    assetId: asset.id,
    openingResidueNgn: round2(openingResidue),
    grossAllowanceNgn: round2(grossAllowance),
    allowanceClaimedNgn: round2(allowanceClaimed),
    notionalResidueNgn: round2(notionalResidue),
    closingResidueNgn: round2(closingResidue),
    explanation: reasons.join(" "),
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [rule.id],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
