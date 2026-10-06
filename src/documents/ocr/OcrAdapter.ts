/**
 * OCR extraction result. Every field is nullable — "not found" is reported explicitly
 * rather than guessed, and confidence is per-field, never a single opaque document-level
 * score (brief §9: extract supplier/customer/invoice number/date/amount/VAT/description/
 * payment reference; never fabricate a value that isn't actually in the text).
 */
export interface ExtractedDocumentFields {
  supplierName: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  documentDate: string | null; // ISO yyyy-mm-dd
  totalAmountNgn: number | null;
  vatAmountNgn: number | null;
  description: string | null;
  paymentReference: string | null;
}

export type FieldConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface OcrResult {
  rawText: string;
  fields: ExtractedDocumentFields;
  fieldConfidence: Record<keyof ExtractedDocumentFields, FieldConfidence | null>;
  engineUsed: string;
}

export interface OcrAdapter {
  readonly engineName: string;
  extract(imageBuffer: Buffer): Promise<OcrResult>;
}
