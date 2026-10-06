/**
 * Accounting depreciation — deliberately separate from the tax engine's capital
 * allowance logic (src/engine/capitalAllowance.ts). Same asset, two independent
 * calculations with different purposes, different rates/lives, and different triggers
 * (company policy vs. statute). See research report §2.6.
 */

export interface DepreciableAssetInput {
  costNgn: number;
  salvageValueNgn: number;
  usefulLifeMonths: number;
  accumulatedDepreciationNgn: number; // depreciation already posted in prior periods
}

export interface MonthlyDepreciationResult {
  amountNgn: number;
  accumulatedAfterNgn: number;
  netBookValueAfterNgn: number;
  isFullyDepreciated: boolean;
}

/**
 * Straight-line monthly depreciation: (cost - salvage) / usefulLifeMonths, capped so
 * accumulated depreciation never exceeds (cost - salvage).
 */
export function calculateStraightLineMonthlyDepreciation(asset: DepreciableAssetInput): MonthlyDepreciationResult {
  if (asset.usefulLifeMonths <= 0) {
    throw new Error("usefulLifeMonths must be positive.");
  }
  const depreciableBase = asset.costNgn - asset.salvageValueNgn;
  if (depreciableBase < 0) {
    throw new Error("salvageValueNgn cannot exceed costNgn.");
  }

  const monthlyAmount = depreciableBase / asset.usefulLifeMonths;
  const remainingToDepreciate = Math.max(depreciableBase - asset.accumulatedDepreciationNgn, 0);
  const amountThisPeriod = round2(Math.min(monthlyAmount, remainingToDepreciate));

  const accumulatedAfter = round2(asset.accumulatedDepreciationNgn + amountThisPeriod);
  const netBookValueAfter = round2(asset.costNgn - accumulatedAfter);

  return {
    amountNgn: amountThisPeriod,
    accumulatedAfterNgn: accumulatedAfter,
    netBookValueAfterNgn: netBookValueAfter,
    isFullyDepreciated: accumulatedAfter >= depreciableBase - 0.005,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
