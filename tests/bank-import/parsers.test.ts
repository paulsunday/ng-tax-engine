import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parseCsv } from "../../src/bank-import/parsers/csvParser";
import { parseXlsx } from "../../src/bank-import/parsers/xlsxParser";
import { parsePdf } from "../../src/bank-import/parsers/pdfParser";

describe("parseCsv (real file content, no mocks)", () => {
  test("parses a realistic bank CSV export", () => {
    const csv = [
      "Date,Narration,Reference,Debit,Credit,Balance",
      "15/06/2026,POS PURCHASE SHOPRITE,REF001,5000.00,,95000.00",
      "16/06/2026,SALARY PAYMENT,REF002,,500000.00,595000.00",
    ].join("\n");
    const { headers, rows } = parseCsv(Buffer.from(csv, "utf-8"));
    expect(headers).toEqual(["Date", "Narration", "Reference", "Debit", "Credit", "Balance"]);
    expect(rows).toHaveLength(2);
    expect(rows[0][1]).toBe("POS PURCHASE SHOPRITE");
  });

  test("handles a BOM-prefixed CSV (common from Excel exports) without corrupting the first header", () => {
    const csv = "﻿Date,Debit,Credit\n01/01/2026,100.00,";
    const { headers } = parseCsv(Buffer.from(csv, "utf-8"));
    expect(headers[0]).toBe("Date");
  });
});

describe("parseXlsx (real workbook, no mocks)", () => {
  test("parses a real .xlsx workbook built in-memory with ExcelJS", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Statement");
    sheet.addRow(["Date", "Narration", "Debit", "Credit", "Balance"]);
    sheet.addRow(["2026-06-15", "POS PURCHASE", 5000, "", 95000]);
    sheet.addRow(["2026-06-16", "SALARY", "", 500000, 595000]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { headers, rows } = await parseXlsx(buffer);
    expect(headers).toEqual(["Date", "Narration", "Debit", "Credit", "Balance"]);
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("SALARY");
  });
});

describe("parsePdf (real PDF built with pdf-lib, no mocks)", () => {
  test("extracts date+amount lines from a genuinely rendered PDF via best-effort heuristics", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Bank Statement", { x: 20, y: 170, size: 14, font });
    page.drawText("15/06/2026 POS PURCHASE SHOPRITE 5,000.00 95,000.00", { x: 20, y: 140, size: 10, font });
    page.drawText("16/06/2026 SALARY PAYMENT 500,000.00 595,000.00", { x: 20, y: 120, size: 10, font });
    const pdfBytes = await doc.save();

    const result = await parsePdf(Buffer.from(pdfBytes));
    expect(result.matchedLineCount).toBeGreaterThanOrEqual(2);
    expect(result.rows.some((r) => r.includes("15/06/2026"))).toBe(true);
    expect(result.rawText).toMatch(/Bank Statement/);
  });

  test("a PDF with no date-shaped lines (e.g. a cover page) extracts zero transaction rows, not fabricated ones", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Account Summary Cover Page", { x: 20, y: 170, size: 14, font });
    const pdfBytes = await doc.save();

    const result = await parsePdf(Buffer.from(pdfBytes));
    expect(result.matchedLineCount).toBe(0);
    expect(result.rows).toHaveLength(0);
  });
});
