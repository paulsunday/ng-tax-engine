import ExcelJS from "exceljs";
import { ParsedTable } from "./csvParser";

export async function parseXlsx(buffer: Buffer): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const allRows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      if (value === null || value === undefined) {
        cells.push("");
      } else if (value instanceof Date) {
        cells.push(value.toISOString().slice(0, 10));
      } else if (typeof value === "object" && "result" in (value as any)) {
        cells.push(String((value as any).result ?? "")); // formula cell
      } else {
        cells.push(String(value));
      }
    });
    allRows.push(cells);
  });

  if (allRows.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = allRows;
  return { headers, rows };
}
