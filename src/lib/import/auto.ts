import type { ProjectSettings, RawFile, SheetMapping } from "../model";
import { detectSheet, suggestMapping } from "./detect";

/** Suggested mapping for every sheet that does not have one yet. Suggestions are always shown for review. */
export function autoMap(files: RawFile[], existing: Record<string, SheetMapping> = {}): Record<string, SheetMapping> {
  const out: Record<string, SheetMapping> = { ...existing };
  for (const file of files) {
    for (const sheet of file.sheets) {
      if (out[sheet.id]) continue;
      out[sheet.id] = suggestMapping(sheet, detectSheet(sheet));
    }
  }
  return out;
}

/** Reporting period = latest month with actual P&L data; currency = the one currency found, if unambiguous. */
export function suggestSettings(files: RawFile[], mappings: Record<string, SheetMapping>, current: ProjectSettings): Partial<ProjectSettings> {
  const actualPeriods: string[] = [];
  const currencies = new Set<string>();
  for (const file of files) {
    for (const sheet of file.sheets) {
      const m = mappings[sheet.id];
      if (!m || m.kind === "ignore") continue;
      const d = detectSheet(sheet, m.headerRow);
      if (m.fixedCurrency) currencies.add(m.fixedCurrency);
      d.currencies.forEach((c) => currencies.add(c));
      if (m.kind === "pnl" && m.fixedScenario === "actual") actualPeriods.push(...d.periods);
    }
  }
  const out: Partial<ProjectSettings> = {};
  if (actualPeriods.length) out.reportingPeriod = actualPeriods.sort().at(-1);
  if (currencies.size === 1) out.currency = [...currencies][0];
  if (!current.companyName) {
    const title = files
      .flatMap((f) => f.sheets.flatMap((s) => s.rows.slice(0, 2).flat()))
      .find((c): c is string => typeof c === "string" && /—|-/.test(c) && c.length < 120);
    const name = title?.split(/\s[—-]\s/)[0]?.trim();
    if (name) out.companyName = name;
  }
  return out;
}
