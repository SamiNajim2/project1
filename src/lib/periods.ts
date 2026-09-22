import type { RawCell } from "./model";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type PeriodParse = { period: string; note?: string } | { error: string };

const pad = (n: number) => String(n).padStart(2, "0");
const make = (year: number, month: number): string => `${year}-${pad(month)}`;
const validYear = (y: number) => y >= 1990 && y <= 2100;

function expandYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** Excel serial date (1900 date system) to ISO date. */
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parses a cell into a monthly period "YYYY-MM". Never guesses silently: ambiguous forms return a note. */
export function parsePeriod(value: RawCell): PeriodParse {
  if (value === null || value === "") return { error: "Period is empty" };
  if (typeof value === "boolean") return { error: `"${value}" is not a period` };

  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 199001 && value <= 210012 && value % 100 >= 1 && value % 100 <= 12) {
      return { period: make(Math.floor(value / 100), value % 100), note: `Read ${value} as YYYYMM` };
    }
    if (value > 20000 && value < 80000) {
      const iso = excelSerialToISO(value);
      return { period: iso.slice(0, 7), note: `Read Excel date serial ${value} as ${iso}` };
    }
    return { error: `${value} is not a recognisable period` };
  }

  const s = value.trim();
  const lower = s.toLowerCase();
  let m: RegExpMatchArray | null;

  if (/^(q[1-4]|h[12])\b|\bq[1-4]\b/i.test(s)) return { error: `"${s}" is quarterly or half-yearly; monthly periods are required` };
  if (/^fy\s?\d{2,4}$/i.test(s)) return { error: `"${s}" is a fiscal year; monthly periods are required` };

  // 2026-06, 2026-06-30, 2026/06, 2026.06, 2026-06-30T00:00:00
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ].*)?$/))) {
    const y = +m[1], mo = +m[2];
    if (validYear(y) && mo >= 1 && mo <= 12) return { period: make(y, mo) };
  }
  // 202606
  if ((m = s.match(/^(\d{4})(\d{2})$/))) {
    const y = +m[1], mo = +m[2];
    if (validYear(y) && mo >= 1 && mo <= 12) return { period: make(y, mo), note: `Read "${s}" as YYYYMM` };
  }
  // Jun-26, Jun 2026, June 2026, Jun'26, 30-Jun-2026, 30 June 2026
  if ((m = lower.match(/^(?:(\d{1,2})[\s\-/.]+)?([a-z]{3,9})\.?[\s\-/.']*(\d{2}|\d{4})$/))) {
    const idx = MONTHS.indexOf(m[2].slice(0, 3));
    if (idx >= 0 && MONTHS.some((mo) => m![2].startsWith(mo))) {
      const y = expandYear(+m[3]);
      if (validYear(y)) return { period: make(y, idx + 1) };
    }
  }
  // 06/2026, 6-2026
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) {
    const mo = +m[1], y = +m[2];
    if (validYear(y) && mo >= 1 && mo <= 12) return { period: make(y, mo) };
  }
  // 30/06/2026 or 06/30/2026
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    const a = +m[1], b = +m[2], y = expandYear(+m[3]);
    if (!validYear(y)) return { error: `"${s}" has an unrecognised year` };
    if (a > 12 && b >= 1 && b <= 12) return { period: make(y, b) };
    if (b > 12 && a >= 1 && a <= 12) return { period: make(y, a) };
    if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
      if (a === b) return { period: make(y, a) };
      return { period: make(y, b), note: `"${s}" is ambiguous (day/month order); read as day/month → ${MONTH_LABELS[b - 1]} ${y}` };
    }
  }
  return { error: `"${s}" is not a recognisable month` };
}

export function isPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return make(Math.floor(total / 12), (total % 12) + 1);
}

export function monthDiff(from: string, to: string): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function periodLabel(period: string): string {
  if (!isPeriod(period)) return period;
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

/** First month of the fiscal year containing `period`. */
export function fiscalYearStart(period: string, fyStartMonth: number): string {
  const [y, m] = period.split("-").map(Number);
  const startYear = m >= fyStartMonth ? y : y - 1;
  return make(startYear, fyStartMonth);
}

/** Months from the fiscal-year start through `period`, inclusive. */
export function ytdPeriods(period: string, fyStartMonth: number): string[] {
  const start = fiscalYearStart(period, fyStartMonth);
  const n = monthDiff(start, period);
  return Array.from({ length: n + 1 }, (_, i) => addMonths(start, i));
}

export function sortPeriods(periods: Iterable<string>): string[] {
  return [...new Set(periods)].sort();
}

/** Missing months between the first and last period of a set. */
export function periodGaps(periods: string[]): string[] {
  const sorted = sortPeriods(periods);
  if (sorted.length < 2) return [];
  const present = new Set(sorted);
  const gaps: string[] = [];
  for (let p = sorted[0]; p < sorted[sorted.length - 1]; p = addMonths(p, 1)) if (!present.has(p)) gaps.push(p);
  return gaps;
}
