import { Explainable } from "../types/common";

export interface TaxLossEntryInput {
  id: string;
  tradeOrBusiness: string;
  yearIncurred: number;
  originalLossNgn: number;
  remainingLossNgn: number; // after any prior utilisation
  isDigitalAsset: boolean;
}

export interface LossUtilisationResult extends Explainable {
  tradeOrBusiness: string;
  availableProfitBeforeLossNgn: number;
  totalLossUtilisedNgn: number;
  remainingProfitAfterLossNgn: number;
  utilisationsByEntry: { lossEntryId: string; amountUtilisedNgn: number; remainingLossNgn: number }[];
}

/**
 * Tax loss schedule per NTA s.27(5)-(6):
 *  - indefinite carry-forward, no carry-back;
 *  - a loss may only offset profit from the SAME trade/business that generated it;
 *  - digital/virtual-asset losses are ring-fenced to digital/virtual-asset profits only;
 *  - oldest losses are applied first (first-in-first-out), consistent with "deducted ...
 *    to the extent possible from the amount of the assessable profits of the first year
 *    of assessment after that in which the loss was incurred."
 */
export function applyLossRelief(
  tradeOrBusiness: string,
  assessableProfitBeforeLossNgn: number,
  isDigitalAssetTrade: boolean,
  lossEntries: TaxLossEntryInput[],
  yearOfAssessment: number
): LossUtilisationResult {
  const eligible = lossEntries
    .filter(
      (l) =>
        l.tradeOrBusiness === tradeOrBusiness &&
        l.isDigitalAsset === isDigitalAssetTrade &&
        l.remainingLossNgn > 0 &&
        l.yearIncurred < yearOfAssessment
    )
    .sort((a, b) => a.yearIncurred - b.yearIncurred); // oldest first

  let remainingProfit = Math.max(assessableProfitBeforeLossNgn, 0);
  let totalUtilised = 0;
  const utilisations: { lossEntryId: string; amountUtilisedNgn: number; remainingLossNgn: number }[] = [];

  for (const entry of eligible) {
    if (remainingProfit <= 0) {
      utilisations.push({ lossEntryId: entry.id, amountUtilisedNgn: 0, remainingLossNgn: entry.remainingLossNgn });
      continue;
    }
    const amount = Math.min(entry.remainingLossNgn, remainingProfit);
    remainingProfit -= amount;
    totalUtilised += amount;
    utilisations.push({ lossEntryId: entry.id, amountUtilisedNgn: round2(amount), remainingLossNgn: round2(entry.remainingLossNgn - amount) });
  }

  const ringFenceNote = isDigitalAssetTrade
    ? " Digital/virtual-asset losses are ring-fenced to digital/virtual-asset profits per NTA s.27(6)."
    : "";

  return {
    tradeOrBusiness,
    availableProfitBeforeLossNgn: round2(assessableProfitBeforeLossNgn),
    totalLossUtilisedNgn: round2(totalUtilised),
    remainingProfitAfterLossNgn: round2(remainingProfit),
    utilisationsByEntry: utilisations,
    explanation:
      `Applied ₦${round2(totalUtilised).toLocaleString()} of carried-forward losses (oldest first) against ₦${round2(
        assessableProfitBeforeLossNgn
      ).toLocaleString()} assessable profit from "${tradeOrBusiness}", per NTA s.27(5): losses may only offset the trade ` +
      `that generated them, carry forward indefinitely, and cannot be carried back.${ringFenceNote}`,
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
