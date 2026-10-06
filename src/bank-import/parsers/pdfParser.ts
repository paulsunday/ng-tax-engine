import { PDFParse } from "pdf-parse";
import { ParsedTable } from "./csvParser";

/**
 * NOTE: pdf-parse v2's pdfjs-dist dependency sets up its Node "fake worker" via a dynamic
 * `import()`, which Jest's default CommonJS test environment refuses to run ("A dynamic
 * import callback was invoked without --experimental-vm-modules"). This genuinely works
 * under plain `node`/`ts-node` with no flags — it is purely a Jest-under-test limitation.
 * Fixed by running the test suite with NODE_OPTIONS=--experimental-vm-modules (see the
 * "test" script in package.json, via cross-env for Windows/Unix portability). If this
 * dependency is ever upgraded, re-check whether the flag is still required.
 */

/**
 * Best-effort PDF bank-statement extraction. PDFs have no reliable tabular structure once
 * converted to plain text — column alignment is lost, and layouts vary enormously between
 * banks. This is explicitly WEAKER than the CSV/XLSX parsers and is documented as such
 * (master-build-prompt §7: "Where technically possible, extract transactions
 * automatically"; for PDF, that technical possibility is limited to a single
 * date-+-amount-per-line heuristic, not genuine table reconstruction).
 *
 * Every row extracted this way MUST be treated as requiring manual review before posting
 * — see BankImportService, which forces requiresManualMapping=true for all PDF imports
 * regardless of what detectColumnMapping() would otherwise say.
 */
export interface PdfExtractionResult extends ParsedTable {
  rawText: string;
  matchedLineCount: number;
  totalLineCount: number;
}

const DATE_PATTERN = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const AMOUNT_PATTERN = /-?₦?\s?\(?[\d,]+\.\d{2}\)?/g;

let workerInitialized = false;

export async function parsePdf(buffer: Buffer): Promise<PdfExtractionResult> {
  if (!workerInitialized) {
    PDFParse.setWorker();
    workerInitialized = true;
  }
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  await parser.destroy();
  const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);

  const rows: string[][] = [];
  for (const line of lines) {
    const dateMatch = line.match(DATE_PATTERN);
    if (!dateMatch) continue;

    const amounts = line.match(AMOUNT_PATTERN);
    if (!amounts || amounts.length === 0) continue;

    // Heuristic: last amount on the line is usually the running balance; the one before it
    // (if present) is the transaction amount. If only one amount is present, treat it as
    // the transaction amount with no balance captured.
    const transactionAmount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[amounts.length - 1];
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1] : "";

    const narration = line.replace(dateMatch[0], "").replace(AMOUNT_PATTERN, "").replace(/\s+/g, " ").trim();

    rows.push([dateMatch[0], narration, transactionAmount, balance]);
  }

  return {
    headers: ["Date", "Narration", "Amount", "Balance"],
    rows,
    rawText: text,
    matchedLineCount: rows.length,
    totalLineCount: lines.length,
  };
}
