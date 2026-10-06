import { RuleRepository } from "../rules/RuleRepository";
import { Explainable } from "../types/common";

interface PayeBand {
  band_order: number;
  amount_ngn: number | null;
  type: "first" | "next" | "above_cumulative_50000000";
  rate: number;
}

interface RentRelief {
  percentage_of_annual_rent: number;
  cap_ngn: number;
  apply: "lower_of";
}

export interface PayeInput {
  employeeId: string;
  stateOfResidence: string;
  annualGrossEmolumentNgn: number;
  annualRentPaidNgn: number;
  isMinimumWageEarner: boolean;
}

export interface PayeResult extends Explainable {
  stateOfResidence: string;
  relevantTaxAuthority: string;
  rentReliefNgn: number;
  taxableIncomeNgn: number;
  annualTaxNgn: number;
  bandBreakdown: { band: string; amountTaxedNgn: number; rate: number; taxNgn: number }[];
}

/**
 * PAYE engine — per-employee, per-state. Jurisdiction is the employee's state of
 * residence (brief §12): two employees of the same employer in different states are
 * NOT interchangeable, because the "relevant tax authority" differs even though the
 * Fourth Schedule rate table itself is a single federal schedule.
 */
export function computePaye(
  input: PayeInput,
  rules: RuleRepository,
  asOfDate: string
): PayeResult {
  if (input.isMinimumWageEarner) {
    return {
      stateOfResidence: input.stateOfResidence,
      relevantTaxAuthority: `${input.stateOfResidence} State Internal Revenue Service`,
      rentReliefNgn: 0,
      taxableIncomeNgn: 0,
      annualTaxNgn: 0,
      bandBreakdown: [],
      explanation: `Employee earns the statutory minimum wage and is excluded from the Fourth Schedule table per NTA s.58 chapeau.`,
      confidence: "VERIFIED_CALCULATION",
      ruleIdsUsed: [],
    };
  }

  const reliefRule = rules.getEffectiveRule<RentRelief>("rent_relief", "PAYE", "NG-STATE", asOfDate);
  const uncappedRelief = input.annualRentPaidNgn * reliefRule.value.percentage_of_annual_rent;
  const rentRelief = Math.min(uncappedRelief, reliefRule.value.cap_ngn);

  const taxableIncome = Math.max(input.annualGrossEmolumentNgn - rentRelief, 0);

  const bandsRule = rules.getEffectiveRule<PayeBand[]>("paye_tax_bands", "PAYE", "NG-STATE", asOfDate);
  const sortedBands = [...bandsRule.value].sort((a, b) => a.band_order - b.band_order);

  let remaining = taxableIncome;
  let cumulativeBandCeiling = 0;
  let totalTax = 0;
  const breakdown: PayeResult["bandBreakdown"] = [];

  for (const band of sortedBands) {
    if (remaining <= 0) break;

    const bandSize = band.amount_ngn ?? Infinity; // the final "above ₦50,000,000" band is open-ended
    const amountInBand = Math.min(remaining, bandSize);
    const tax = amountInBand * band.rate;

    totalTax += tax;
    remaining -= amountInBand;
    cumulativeBandCeiling += bandSize;

    breakdown.push({
      band: band.type === "first" ? `First ₦${band.amount_ngn?.toLocaleString()}` :
            band.type === "next" ? `Next ₦${band.amount_ngn?.toLocaleString()}` :
            `Above ₦50,000,000`,
      amountTaxedNgn: round2(amountInBand),
      rate: band.rate,
      taxNgn: round2(tax),
    });
  }

  return {
    stateOfResidence: input.stateOfResidence,
    relevantTaxAuthority: `${input.stateOfResidence} State Internal Revenue Service`,
    rentReliefNgn: round2(rentRelief),
    taxableIncomeNgn: round2(taxableIncome),
    annualTaxNgn: round2(totalTax),
    bandBreakdown: breakdown,
    explanation:
      `Rent relief = min(${(reliefRule.value.percentage_of_annual_rent * 100).toFixed(0)}% of ₦${input.annualRentPaidNgn.toLocaleString()}, ₦${reliefRule.value.cap_ngn.toLocaleString()} cap) ` +
      `= ₦${round2(rentRelief).toLocaleString()} (${reliefRule.sourceReference}). Taxable income = ₦${round2(taxableIncome).toLocaleString()}. ` +
      `Applied Fourth Schedule progressive bands (${bandsRule.sourceReference}) for a total annual PAYE of ₦${round2(totalTax).toLocaleString()}, ` +
      `administered by the ${input.stateOfResidence} State Internal Revenue Service.`,
    confidence: "VERIFIED_CALCULATION",
    ruleIdsUsed: [reliefRule.id, bandsRule.id],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
