import { ExtractedDocumentFields, FieldConfidence } from "./OcrAdapter";

/**
 * Deterministic regex-based field extraction over raw OCR text. This is NOT an LLM and
 * makes NO attempt to "understand" the document — every field is either found via an
 * explicit label/pattern or reported null. This matches the project's existing stance
 * (see src/engine/*, the tax rules engine) that extraction/calculation logic must be
 * inspectable and never silently guess. Expect real-world accuracy to be modest — label
 * conventions vary hugely between suppliers' invoice templates — which is exactly why
 * every field carries its own confidence rather than one overall score.
 */

const CURRENCY_NUMBER = /-?₦?\s?[\d,]+\.\d{2}/;

function findLabelledAmount(text: string, labels: string[]): { value: number; confidence: FieldConfidence } | null {
  for (const label of labels) {
    const regex = new RegExp(`\\b${label}\\b[^\\d₦\\n]{0,15}(${CURRENCY_NUMBER.source})`, "i");
    const match = text.match(regex);
    if (match) {
      const value = parseFloat(match[1].replace(/[,₦\s]/g, ""));
      if (!isNaN(value)) return { value, confidence: "HIGH" };
    }
  }
  return null;
}

function findLabelledText(text: string, labels: string[]): { value: string; confidence: FieldConfidence } | null {
  for (const label of labels) {
    const regex = new RegExp(`\\b${label}\\b\\s*[:#-]?\\s*([A-Za-z0-9\\-\\/]+)`, "i");
    const match = text.match(regex);
    if (match && match[1].trim().length > 0) {
      return { value: match[1].trim(), confidence: "HIGH" };
    }
  }
  return null;
}

function findLabelledLine(text: string, labels: string[]): { value: string; confidence: FieldConfidence } | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    for (const label of labels) {
      const regex = new RegExp(`^\\s*${label}\\s*[:#-]\\s*(.+)$`, "i");
      const match = line.match(regex);
      if (match && match[1].trim().length > 0) {
        return { value: match[1].trim(), confidence: "MEDIUM" };
      }
    }
  }
  return null;
}

const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const DMY_DATE = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;

function parseIsoOrDmy(raw: string): string | null {
  const iso = raw.match(ISO_DATE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(DMY_DATE);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    if (Number(m) > 12) return null; // ambiguous — do not guess MM/DD
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * Prefers a date found right next to an explicit "Date:"-style label (HIGH confidence —
 * other dates on a document, e.g. inside a reference number, must not be picked up
 * instead). Falls back to the first date-shaped text anywhere only if no labelled date
 * exists, at reduced confidence.
 */
function findDate(text: string): { value: string; confidence: FieldConfidence } | null {
  const labelled = text.match(new RegExp(`\\b(?:date|invoice date|dated)\\b\\s*[:#-]?\\s*(${ISO_DATE.source}|${DMY_DATE.source})`, "i"));
  if (labelled) {
    const parsed = parseIsoOrDmy(labelled[1]);
    if (parsed) return { value: parsed, confidence: "HIGH" };
  }

  const anywhere = parseIsoOrDmy(text);
  return anywhere ? { value: anywhere, confidence: "LOW" } : null;
}

export function extractFieldsFromText(rawText: string): {
  fields: ExtractedDocumentFields;
  confidence: Record<keyof ExtractedDocumentFields, FieldConfidence | null>;
} {
  const total = findLabelledAmount(rawText, ["grand total", "total due", "amount due", "total"]);
  const vat = findLabelledAmount(rawText, ["vat", "value added tax"]);
  const invoiceNumber = findLabelledText(rawText, ["invoice no", "invoice number", "invoice #", "inv no"]);
  const paymentReference = findLabelledText(rawText, ["payment ref", "reference no", "reference", "ref no"]);
  const date = findDate(rawText);
  const supplier = findLabelledLine(rawText, ["from", "supplier", "vendor", "sold by"]);
  const customer = findLabelledLine(rawText, ["to", "bill to", "customer", "sold to"]);

  const fields: ExtractedDocumentFields = {
    supplierName: supplier?.value ?? null,
    customerName: customer?.value ?? null,
    invoiceNumber: invoiceNumber?.value ?? null,
    documentDate: date?.value ?? null,
    totalAmountNgn: total?.value ?? null,
    vatAmountNgn: vat?.value ?? null,
    description: null, // no reliable generic heuristic for free-text description — left for manual entry
    paymentReference: paymentReference?.value ?? null,
  };

  const confidence: Record<keyof ExtractedDocumentFields, FieldConfidence | null> = {
    supplierName: supplier?.confidence ?? null,
    customerName: customer?.confidence ?? null,
    invoiceNumber: invoiceNumber?.confidence ?? null,
    documentDate: date?.confidence ?? null,
    totalAmountNgn: total?.confidence ?? null,
    vatAmountNgn: vat?.confidence ?? null,
    description: null,
    paymentReference: paymentReference?.confidence ?? null,
  };

  return { fields, confidence };
}
