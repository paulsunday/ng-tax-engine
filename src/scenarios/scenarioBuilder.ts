/**
 * Pure scenario arithmetic (master-build-prompt §12-14). The core anti-fabrication rule
 * from the brief is enforced by CONSTRUCTION here, not by convention: every adjustment
 * this module can apply must be passed in as an already-existing candidate (a DRAFT
 * Invoice/Expense that is a REAL row in the database, or a depreciation amount computed
 * by the SAME formula already used for real postings in src/accounting/depreciation.ts).
 * This module has no code path that invents a number — it only sums numbers handed to it.
 */

export interface AdjustmentCandidate {
  sourceType: "Invoice" | "Expense" | "AssetDepreciation";
  sourceId: string;
  description: string;
  amountNgn: number; // always a positive magnitude; direction is implied by sourceType/scenario
}

export interface ScenarioResult {
  baseAccountingProfitNgn: number;
  adjustments: AdjustmentCandidate[];
  totalAdjustmentNgn: number; // signed: positive for profit scenario, negative for loss scenario
  adjustedAccountingProfitNgn: number;
}

/**
 * PROFIT SCENARIO: adds revenue from unposted DRAFT invoices that already exist and are
 * fully documented (real customer, real line items) — "what would profit look like if we
 * finished recognizing revenue we've already invoiced for." Never invents a sale.
 */
export function buildProfitScenario(baseAccountingProfitNgn: number, unpostedInvoiceRevenue: AdjustmentCandidate[]): ScenarioResult {
  const totalAdjustmentNgn = round2(unpostedInvoiceRevenue.reduce((acc, a) => acc + a.amountNgn, 0));
  return {
    baseAccountingProfitNgn: round2(baseAccountingProfitNgn),
    adjustments: unpostedInvoiceRevenue,
    totalAdjustmentNgn,
    adjustedAccountingProfitNgn: round2(baseAccountingProfitNgn + totalAdjustmentNgn),
  };
}

/**
 * LOSS SCENARIO: subtracts costs from unposted DRAFT expenses that already exist, PLUS
 * any depreciation already calculable for the period but not yet posted — "the lowest
 * defensible accounting result given what's genuinely documented in the system today."
 * Never fabricates an expense or impairment that has no underlying record.
 */
export function buildLossScenario(baseAccountingProfitNgn: number, unpostedExpenses: AdjustmentCandidate[], unpostedDepreciation: AdjustmentCandidate[]): ScenarioResult {
  const allAdjustments = [...unpostedExpenses, ...unpostedDepreciation];
  const totalAdjustmentNgn = -round2(allAdjustments.reduce((acc, a) => acc + a.amountNgn, 0));
  return {
    baseAccountingProfitNgn: round2(baseAccountingProfitNgn),
    adjustments: allAdjustments,
    totalAdjustmentNgn,
    adjustedAccountingProfitNgn: round2(baseAccountingProfitNgn + totalAdjustmentNgn),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
