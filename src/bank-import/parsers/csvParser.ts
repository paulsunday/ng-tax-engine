import { parse } from "csv-parse/sync";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(buffer: Buffer): ParsedTable {
  const records: string[][] = parse(buffer, {
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  if (records.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers, rows };
}
