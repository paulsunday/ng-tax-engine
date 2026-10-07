import {
  TaxAuthorityAdapter,
  TaxpayerRecord,
  ValidationResult,
  ReturnPayload,
  SubmissionResult,
  SubmissionStatus,
  ReceiptResult,
  PaymentStatusResult,
  FilingCapability,
} from "./TaxAuthorityAdapter";

/**
 * No confirmed official e-filing API exists for NRS/State-IRS at the time of research
 * (see REGULATORY_RESEARCH_REPORT.md §8 item 9). This adapter therefore never calls out
 * to a live system — `submitReturn` always returns succeeded:false with errorClass
 * "VALIDATION" and a note directing the caller to the generated filing package, so the
 * calling code never mistakes a manual workflow for a real submission (brief §28-29:
 * "If filing fails: Do not mark as filed.").
 *
 * What this adapter DOES do: assemble the official-return data into a structured filing
 * package (brief §30) that a human can submit through the authority's actual portal.
 */
export class ManualFilingAdapter implements TaxAuthorityAdapter {
  readonly authorityName: string;
  readonly supportsAutomaticSubmission = false;
  // Separately overridable per authority — a subclass that confirms a real export/API
  // capability should override these, not supportsAutomaticSubmission alone.
  readonly filingCapability: FilingCapability = "MANUAL_OFFICIAL_PORTAL";
  readonly paymentCapability: FilingCapability = "MANUAL_OFFICIAL_PORTAL";

  constructor(authorityName: string) {
    this.authorityName = authorityName;
  }

  async getTaxpayer(tin: string): Promise<TaxpayerRecord | null> {
    throw new Error(
      `getTaxpayer() is not available: no confirmed official API exists for ${this.authorityName}. ` +
        `Look up the taxpayer manually via the authority's official portal.`
    );
  }

  async validateTaxpayer(tin: string): Promise<ValidationResult> {
    const valid = /^[A-Za-z0-9-]{6,20}$/.test(tin);
    return {
      valid,
      errors: valid ? [] : [`TIN "${tin}" does not match the expected format — verify manually with ${this.authorityName}.`],
    };
  }

  async validateReturn(payload: ReturnPayload): Promise<ValidationResult> {
    const errors: string[] = [];
    if (!payload.taxpayerTin) errors.push("Missing taxpayer TIN.");
    if (payload.taxLiabilityNgn < 0) errors.push("Tax liability cannot be negative.");
    if (new Date(payload.periodEnd) < new Date(payload.periodStart)) errors.push("Period end precedes period start.");
    return { valid: errors.length === 0, errors };
  }

  async submitReturn(payload: ReturnPayload): Promise<SubmissionResult> {
    return {
      succeeded: false,
      errorClass: "VALIDATION",
      rawResponse: {
        reason:
          `No confirmed official e-filing API exists for ${this.authorityName}. A filing package has been generated instead — ` +
          `submit it through the authority's official portal and then record the resulting receipt manually.`,
        filingPackage: buildFilingPackage(payload),
      },
    };
  }

  async getSubmissionStatus(submissionReference: string): Promise<SubmissionStatus> {
    return "NOT_SUBMITTED";
  }

  async getReceipt(submissionReference: string): Promise<ReceiptResult> {
    return { available: false };
  }

  async getPaymentStatus(paymentReference: string): Promise<PaymentStatusResult> {
    return { status: "UNPAID" };
  }
}

/** Human-submittable filing package: the data a preparer needs to complete the official portal form. */
export function buildFilingPackage(payload: ReturnPayload): Record<string, unknown> {
  return {
    taxType: payload.taxType,
    period: `${payload.periodStart} to ${payload.periodEnd}`,
    taxpayerTin: payload.taxpayerTin,
    taxLiabilityNgn: payload.taxLiabilityNgn,
    calculationBreakdown: payload.calculationBreakdown,
    instructions: [
      "1. Log in to the relevant tax authority's official e-filing portal using your registered credentials.",
      "2. Select the tax type and period matching this package.",
      "3. Enter the calculation figures below, cross-checking each line against the portal's own form fields.",
      "4. Attach the required supporting documents (see the company's required-documents checklist).",
      "5. Submit, then record the portal's acknowledgement/receipt reference back into this system.",
    ],
  };
}
