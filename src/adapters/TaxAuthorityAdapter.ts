/**
 * Adapter interface (brief §31). One implementation per tax authority — never hardcode a
 * single authority's assumptions into the engine or the calling code.
 *
 * Research finding (REGULATORY_RESEARCH_REPORT.md §8 item 9): no official NRS/FIRS/State-IRS
 * e-filing API has been confirmed as publicly available at the time of this research pass.
 * Per brief §30 ("DO NOT invent an API... DO NOT scrape a portal"), this codebase ships only
 * ManualFilingAdapter, which produces the filing package and payment instructions a human
 * then submits through the authority's official portal. When/if an official API is confirmed,
 * implement a new class against this same interface — no other file in the engine needs to change.
 */

export type SubmissionStatus = "NOT_SUBMITTED" | "PENDING" | "ACCEPTED" | "REJECTED" | "ERROR";

export interface TaxpayerRecord {
  tin: string;
  name: string;
  registeredAddress?: string;
}

export interface ReturnPayload {
  taxReturnId: string;
  taxType: string;
  periodStart: string;
  periodEnd: string;
  taxpayerTin: string;
  calculationBreakdown: Record<string, unknown>;
  taxLiabilityNgn: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SubmissionResult {
  succeeded: boolean;
  submissionReference?: string;
  errorClass?: "TEMPORARY" | "AUTHENTICATION" | "VALIDATION" | "AUTHORITY_REJECTION" | "NETWORK" | "DUPLICATE" | "UNKNOWN";
  rawResponse?: unknown;
}

export interface ReceiptResult {
  available: boolean;
  receiptReference?: string;
  receiptDocumentUrl?: string;
}

export interface PaymentStatusResult {
  status: "UNPAID" | "PENDING" | "CONFIRMED" | "FAILED";
  paymentReference?: string;
}

export interface TaxAuthorityAdapter {
  readonly authorityName: string;
  readonly supportsAutomaticSubmission: boolean;

  getTaxpayer(tin: string): Promise<TaxpayerRecord | null>;
  validateTaxpayer(tin: string): Promise<ValidationResult>;
  validateReturn(payload: ReturnPayload): Promise<ValidationResult>;
  submitReturn(payload: ReturnPayload): Promise<SubmissionResult>;
  getSubmissionStatus(submissionReference: string): Promise<SubmissionStatus>;
  getReceipt(submissionReference: string): Promise<ReceiptResult>;
  getPaymentStatus(paymentReference: string): Promise<PaymentStatusResult>;
}
