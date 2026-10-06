/**
 * Pure arithmetic for invoice/expense line totals. Deliberately takes vatRate as an
 * explicit per-line input rather than hardcoding 7.5% here — the caller (the NestJS
 * service layer) is responsible for resolving the default VAT rate from the tax engine's
 * RuleRepository (rule key "vat_standard_rate") before calling this, so the accounting
 * module never duplicates or drifts from the one verified source of that figure.
 */

export interface LineItemInput {
  description?: string; // passthrough only — never used in the arithmetic below
  quantity: number;
  unitPriceNgn: number;
  vatRate: number; // e.g. 0.075 — resolved by the caller, not defaulted here
}

export interface LineItemResult extends LineItemInput {
  lineSubtotalNgn: number;
  lineVatNgn: number;
  lineTotalNgn: number;
}

export interface DocumentTotals {
  lines: LineItemResult[];
  subtotalNgn: number;
  vatAmountNgn: number;
  totalNgn: number;
}

export function calculateDocumentTotals(items: LineItemInput[]): DocumentTotals {
  if (items.length === 0) throw new Error("A document must have at least one line item.");

  const lines = items.map((item) => {
    if (item.quantity <= 0) throw new Error("quantity must be positive.");
    if (item.unitPriceNgn < 0) throw new Error("unitPriceNgn cannot be negative.");
    if (item.vatRate < 0) throw new Error("vatRate cannot be negative.");

    const lineSubtotal = round2(item.quantity * item.unitPriceNgn);
    const lineVat = round2(lineSubtotal * item.vatRate);
    return { ...item, lineSubtotalNgn: lineSubtotal, lineVatNgn: lineVat, lineTotalNgn: round2(lineSubtotal + lineVat) };
  });

  const subtotal = round2(lines.reduce((acc, l) => acc + l.lineSubtotalNgn, 0));
  const vat = round2(lines.reduce((acc, l) => acc + l.lineVatNgn, 0));

  return { lines, subtotalNgn: subtotal, vatAmountNgn: vat, totalNgn: round2(subtotal + vat) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
