import { ManualFilingAdapter, buildFilingPackage } from "./ManualFilingAdapter";
import { ReturnPayload, SubmissionResult, ValidationResult } from "./TaxAuthorityAdapter";

/**
 * Enugu State Internal Revenue Service adapter.
 *
 * Research finding (research/state_profiles.json, verification_status FULLY_RESEARCHED):
 * ESIRS operates a citizen/business self-service web portal ("EnuguCMS") at
 * https://irs.en.gov.ng, with online registration (ESBN), bill-based payment through
 * Remita/Flutterwave/Interswitch/e-Transact/Moniepoint/Sayswitch/Unified Payments, and a
 * Tax Clearance Certificate workflow. NO developer documentation, sandbox, or
 * machine-to-machine API was found anywhere on the official site at the time of research.
 *
 * Per brief §11, this means: no scraping, no bypassing the portal's own auth, no invented
 * endpoints. This adapter only ever prepares a filing/payment package that a human
 * completes through the real EnuguCMS portal — supportsAutomaticSubmission is false, and
 * it will stay false until ESIRS actually publishes an API (brief §10 gives the target
 * shape to implement against if/when that happens).
 */
export class EnuguTaxAuthorityAdapter extends ManualFilingAdapter {
  constructor() {
    super("Enugu State Internal Revenue Service (ESIRS)");
  }

  async validateTaxpayer(esbn: string): Promise<ValidationResult> {
    // ESBN format has not been published anywhere on the official site beyond "issued via
    // the portal" — so this can only check presence, not shape. Do not invent a regex here.
    return {
      valid: esbn.length > 0,
      errors: esbn.length > 0 ? [] : ["ESBN (Enugu State Social Benefit Number) is required — obtain via https://irs.en.gov.ng or any Enugu tax office."],
    };
  }

  async submitReturn(payload: ReturnPayload): Promise<SubmissionResult> {
    return {
      succeeded: false,
      errorClass: "VALIDATION",
      rawResponse: {
        reason:
          "ESIRS has not published a filing/submission API. Complete this filing through the EnuguCMS self-service " +
          "portal (https://irs.en.gov.ng) using the generated package below, then record the resulting Consolidated " +
          "Demand Notice / bill number and payment receipt back into this system.",
        filingPackage: {
          ...buildFilingPackage(payload),
          portalUrl: "https://irs.en.gov.ng",
          approvedPaymentGateways: ["Remita", "Flutterwave", "Interswitch", "e-Transact", "Moniepoint", "Sayswitch", "Unified Payments"],
          note:
            "Self-printed receipts were explicitly listed as 'not yet available' on the official FAQ as of this research " +
            "pass — expect to need the portal/bank-issued receipt rather than a self-service PDF.",
        },
      },
    };
  }
}
