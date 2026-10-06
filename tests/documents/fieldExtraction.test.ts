import { extractFieldsFromText } from "../../src/documents/ocr/fieldExtraction";

describe("extractFieldsFromText", () => {
  test("extracts invoice number, date, total and VAT from a typical invoice layout", () => {
    const text = [
      "Acme Supplies Ltd",
      "Invoice No: INV-2026-0042",
      "Date: 15/06/2026",
      "Bill To: Netwave Technologies Ltd",
      "Subtotal: 100,000.00",
      "VAT: 7,500.00",
      "Total: 107,500.00",
    ].join("\n");

    const { fields, confidence } = extractFieldsFromText(text);
    expect(fields.invoiceNumber).toBe("INV-2026-0042");
    expect(fields.documentDate).toBe("2026-06-15");
    expect(fields.totalAmountNgn).toBe(107500);
    expect(fields.vatAmountNgn).toBe(7500);
    expect(confidence.totalAmountNgn).toBe("HIGH");
  });

  test("returns null (not a guess) for fields that are not present in the text at all", () => {
    const { fields, confidence } = extractFieldsFromText("Some random unrelated text with no structure.");
    expect(fields.invoiceNumber).toBeNull();
    expect(fields.totalAmountNgn).toBeNull();
    expect(fields.vatAmountNgn).toBeNull();
    expect(confidence.invoiceNumber).toBeNull();
  });

  test("does not confuse an ISO date elsewhere in the text for an ambiguous DD/MM date", () => {
    const { fields } = extractFieldsFromText("Reference: 2026-06-15-X\nDate: 2026-06-20");
    expect(fields.documentDate).toBe("2026-06-20");
  });

  test("rejects an ambiguous date where the second number exceeds 12 rather than reinterpreting as MM/DD", () => {
    const { fields } = extractFieldsFromText("Date: 25/13/2026");
    expect(fields.documentDate).toBeNull();
  });

  test("extracts a payment reference using an alternate label", () => {
    const { fields } = extractFieldsFromText("Payment Ref: PMT-998877\nAmount: 5,000.00");
    expect(fields.paymentReference).toBe("PMT-998877");
  });

  test("picks the 'Total' label over 'Subtotal' when both are present (last/most-specific match)", () => {
    const { fields } = extractFieldsFromText("Subtotal: 50,000.00\nTotal: 53,750.00");
    expect(fields.totalAmountNgn).toBe(53750);
  });

  test("never fabricates a description — always null, left for manual entry", () => {
    const { fields } = extractFieldsFromText("Invoice No: INV-1\nTotal: 1,000.00\nSome long free text description of goods sold.");
    expect(fields.description).toBeNull();
  });
});
