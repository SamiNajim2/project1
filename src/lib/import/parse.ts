import * as XLSX from "xlsx";
import type { RawCell, RawFile, RawSheet } from "../model";

const MAX_ROWS = 20_000;
const MAX_COLS = 200;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function cellValue(cell: XLSX.CellObject | undefined): RawCell {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.t === "d" && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.t === "n" && typeof cell.v === "number") {
    // Keep what the user sees in Excel for percentage cells (0.03 formatted as 3%).
    if (typeof cell.z === "string" && cell.z.includes("%")) return `${Math.round(cell.v * 100 * 1e10) / 1e10}%`;
    return cell.v;
  }
  if (cell.t === "b") return Boolean(cell.v);
  if (cell.t === "e") return cell.w ?? "#ERROR";
  return String(cell.v);
}

function sheetToRaw(name: string, ws: XLSX.WorkSheet): RawSheet {
  const ref = ws["!ref"];
  if (!ref) return { id: newId(), name, rows: [], truncated: false };
  const range = XLSX.utils.decode_range(ref);
  const lastRow = Math.min(range.e.r, MAX_ROWS - 1);
  const lastCol = Math.min(range.e.c, MAX_COLS - 1);
  const rows: RawCell[][] = [];
  // Rows are kept from A1 so that row index + 1 is always the Excel row number.
  for (let r = 0; r <= lastRow; r++) {
    const row: RawCell[] = [];
    for (let c = 0; c <= lastCol; c++) row.push(cellValue(ws[XLSX.utils.encode_cell({ r, c })]));
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((v) => v === null || v === "")) rows.pop();
  return { id: newId(), name, rows, truncated: range.e.r > lastRow || range.e.c > lastCol };
}

/** Parses file contents (browser or Node). CSV cells stay as text so nothing is reinterpreted on import. */
export function parseWorkbookData(name: string, data: ArrayBuffer | Uint8Array | string, size: number): RawFile {
  const isCsv = typeof data === "string";
  const workbook = isCsv
    ? XLSX.read(data, { type: "string", raw: true, dense: false })
    : XLSX.read(data, { type: "array", cellDates: true, cellNF: true });
  const sheets = workbook.SheetNames.map((sheetName) => sheetToRaw(isCsv ? name.replace(/\.csv$/i, "") : sheetName, workbook.Sheets[sheetName]));
  if (sheets.every((s) => s.rows.length === 0)) throw new Error(`${name}: the file has no data`);
  return { id: newId(), name, size, format: isCsv ? "csv" : "xlsx", importedAt: new Date().toISOString(), sheets };
}

/** Reads an .xlsx or .csv file chosen in the browser. */
export async function parseFile(file: File): Promise<RawFile> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  const isXlsx = /\.xlsx$/i.test(file.name);
  if (!isCsv && !isXlsx) throw new Error(`${file.name}: only .xlsx and .csv files are supported`);
  return parseWorkbookData(file.name, isCsv ? await file.text() : await file.arrayBuffer(), file.size);
}
