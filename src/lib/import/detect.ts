import { DRIVER_DEFS, FIELDS, guessKind, guessScenario, matchAlias } from "../fields";
import type { AnyField, DatasetKind, RawCell, RawSheet, SheetMapping } from "../model";
import { detectCurrency, isCurrencyCode, parseAmount } from "../numbers";
import { parsePeriod, sortPeriods } from "../periods";

export interface ColumnProfile {
  index: number;
  letter: string;
  header: string;
  nonEmpty: number;
  numeric: number;
  periods: number;
  samples: string[];
}

export interface SheetDetection {
  headerRow: number;
  headers: string[];
  columns: ColumnProfile[];
  /** Columns whose header is a month (wide layout). */
  periodHeaderColumns: number[];
  periods: string[];
  currencies: string[];
  dataRows: number;
  suggestedKind: DatasetKind | "ignore";
}

export function columnLetter(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellText(v: RawCell): string {
  return v === null ? "" : String(v).trim();
}

const isEmptyRow = (row: RawCell[] | undefined) => !row || row.every((c) => cellText(c) === "");

/** The header row is the first row that looks like column titles: several text cells, followed by data. */
export function detectHeaderRow(rows: RawCell[][]): number {
  const limit = Math.min(rows.length, 20);
  let widest = 0;
  for (let r = 0; r < limit; r++) widest = Math.max(widest, rows[r].filter((c) => cellText(c) !== "").length);
  for (let r = 0; r < limit; r++) {
    const cells = rows[r].filter((c) => cellText(c) !== "");
    const text = cells.filter((c) => typeof c === "string" && "error" in parseAmount(c)).length;
    if (cells.length >= 2 && cells.length >= Math.ceil(widest * 0.6) && text >= Math.ceil(cells.length / 2)) return r;
  }
  return rows.findIndex((row) => !isEmptyRow(row)) ?? 0;
}

export function detectSheet(sheet: RawSheet, headerRowOverride?: number): SheetDetection {
  const rows = sheet.rows;
  const headerRow = headerRowOverride ?? Math.max(0, detectHeaderRow(rows));
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const headers = Array.from({ length: width }, (_, c) => cellText(rows[headerRow]?.[c] ?? null));
  const body = rows.slice(headerRow + 1).filter((r) => !isEmptyRow(r));

  const columns: ColumnProfile[] = headers.map((header, c) => {
    let nonEmpty = 0, numeric = 0, periods = 0;
    const samples: string[] = [];
    for (const row of body) {
      const v = row[c] ?? null;
      if (cellText(v) === "") continue;
      nonEmpty++;
      if ("value" in parseAmount(v)) numeric++;
      if (typeof v === "string" && "period" in parsePeriod(v)) periods++;
      if (samples.length < 3) samples.push(cellText(v));
    }
    return { index: c, letter: columnLetter(c), header, nonEmpty, numeric, periods, samples };
  });

  const periodHeaderColumns = headers.flatMap((h, c) => (h && "period" in parsePeriod(h) && !/^\d+(\.\d+)?$/.test(h) ? [c] : []));

  const periods = new Set<string>();
  for (const c of periodHeaderColumns) {
    const p = parsePeriod(headers[c]);
    if ("period" in p) periods.add(p.period);
  }
  for (const col of columns) {
    if (col.periods > 0 && col.periods >= col.nonEmpty * 0.8) {
      for (const row of body) {
        const p = parsePeriod(row[col.index] ?? null);
        if ("period" in p) periods.add(p.period);
      }
    }
  }

  const currencies = new Set<string>();
  for (const row of rows.slice(0, headerRow + 1)) for (const cell of row) {
    const cur = detectCurrency(cellText(cell));
    if (cur) currencies.add(cur);
  }
  for (const col of columns) {
    if (/currency|ccy/i.test(col.header)) {
      for (const row of body) if (isCurrencyCode(cellText(row[col.index] ?? null))) currencies.add(cellText(row[col.index] ?? null).toUpperCase());
    } else {
      for (const s of col.samples) {
        const cur = /[$€£¥₹]/.test(s) ? detectCurrency(s) : null;
        if (cur) currencies.add(cur);
      }
    }
  }

  return {
    headerRow,
    headers,
    columns,
    periodHeaderColumns,
    periods: sortPeriods(periods),
    currencies: [...currencies],
    dataRows: body.length,
    suggestedKind: guessKind(sheet.name, headers),
  };
}

function bestColumn(detection: SheetDetection, aliases: string[], taken: Set<number>, predicate?: (c: ColumnProfile) => boolean): number | null {
  let best: number | null = null;
  let score = 0;
  for (const col of detection.columns) {
    if (taken.has(col.index) || detection.periodHeaderColumns.includes(col.index)) continue;
    if (predicate && !predicate(col)) continue;
    const s = matchAlias(col.header, aliases);
    if (s > score) {
      score = s;
      best = col.index;
    }
  }
  return best;
}

export function suggestMapping(sheet: RawSheet, detection: SheetDetection, kindOverride?: DatasetKind | "ignore"): SheetMapping {
  const kind = kindOverride ?? detection.suggestedKind;
  const titleText = sheet.rows.slice(0, detection.headerRow + 1).flat().map(cellText).join(" ");
  const mapping: SheetMapping = {
    kind,
    headerRow: detection.headerRow,
    layout: kind === "pnl" && detection.periodHeaderColumns.length >= 2 ? "wide" : "long",
    columns: {},
    periodColumns: kind === "pnl" ? detection.periodHeaderColumns : [],
    fixedScenario: kind === "pnl" ? (guessScenario(sheet.name) ?? guessScenario(titleText) ?? "actual") : null,
    fixedCurrency: detection.currencies.length === 1 ? detection.currencies[0] : null,
    costsNegative: false,
    lossesNegative: false,
  };
  if (kind === "ignore") return mapping;

  const taken = new Set<number>();
  for (const def of FIELDS[kind]) {
    if (mapping.layout === "wide" && (def.field === "period" || def.field === "amount")) continue;
    const numericField = !["account", "category", "scenario", "currency", "period", "driver"].includes(def.field);
    const col = bestColumn(detection, def.aliases, taken, numericField ? (c) => c.numeric > 0 || c.nonEmpty === 0 : undefined);
    mapping.columns[def.field as AnyField] = col;
    if (col !== null) taken.add(col);
  }
  if (kind === "pnl" && mapping.columns.scenario != null) mapping.fixedScenario = null;
  if (kind === "drivers" && mapping.columns.driver == null) {
    mapping.columns.driver = detection.columns.find((c) => c.numeric === 0 && c.nonEmpty > 0)?.index ?? null;
  }
  // Cost and loss signs: suggest the conversion when most values are negative (shown to the user, never silent).
  if (kind === "mrr") {
    const neg = ["contraction", "churn"].some((f) => {
      const c = mapping.columns[f as AnyField];
      if (c == null) return false;
      const vals = sheet.rows.slice(detection.headerRow + 1).map((r) => parseAmount(r[c] ?? null)).filter((p) => "value" in p) as { value: number }[];
      return vals.length > 0 && vals.filter((v) => v.value < 0).length > vals.length / 2;
    });
    mapping.lossesNegative = neg;
  }
  return mapping;
}

export function driverKeysFound(sheet: RawSheet, mapping: SheetMapping): string[] {
  const col = mapping.columns.driver;
  if (col == null) return [];
  return sheet.rows.slice(mapping.headerRow + 1).map((r) => cellText(r[col] ?? null)).filter(Boolean).filter((n) => Object.values(DRIVER_DEFS).some((d) => matchAlias(n, d.aliases) > 0));
}
