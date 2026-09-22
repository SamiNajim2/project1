import { DRIVER_DEFS, guessDriver, guessScenario, guessTreatment } from "./fields";
import { cellText, columnLetter } from "./import/detect";
import type {
  AccountTreatment,
  CashField,
  CashRecord,
  DriverKey,
  ForecastScenario,
  Issue,
  MrrField,
  MrrRecord,
  PnlRecord,
  RawCell,
  RawFile,
  RawSheet,
  SheetMapping,
  SourceCell,
} from "./model";
import { isCurrencyCode, parseAmount } from "./numbers";
import { parsePeriod } from "./periods";

export interface DriverRow {
  key: DriverKey;
  name: string;
  values: Partial<Record<ForecastScenario, number>>;
  sources: Partial<Record<ForecastScenario, SourceCell>>;
}

export interface AccountInfo {
  name: string;
  category: string | null;
  suggested: AccountTreatment;
}

export interface NormalizeResult {
  pnl: PnlRecord[];
  cash: CashRecord[];
  mrr: MrrRecord[];
  drivers: DriverRow[];
  accounts: AccountInfo[];
  issues: Issue[];
}

const COST_TREATMENTS = new Set<AccountTreatment>(["cogs", "opex", "other_expense", "subtotal:cogs", "subtotal:opex"]);

class IssueLog {
  issues: Issue[] = [];
  private notes = new Map<string, { count: number; example: string; base: Omit<Issue, "id" | "message"> }>();
  add(issue: Omit<Issue, "id">) {
    this.issues.push({ ...issue, id: `I${this.issues.length + 1}` });
  }
  /** Conversions are summarised per column so the report stays readable, but always recorded. */
  note(key: string, example: string, base: Omit<Issue, "id" | "message">) {
    const n = this.notes.get(key);
    if (n) n.count++;
    else this.notes.set(key, { count: 1, example, base });
  }
  flush(): Issue[] {
    for (const [, n] of this.notes) {
      this.add({ ...n.base, message: `${n.count} value${n.count > 1 ? "s" : ""} converted on import, e.g. ${n.example}. The raw file is unchanged.` });
    }
    this.notes.clear();
    return this.issues;
  }
}

function source(file: RawFile, sheet: RawSheet, row: number, col: number, header: string, raw: RawCell): SourceCell {
  return { file: file.name, sheet: sheet.name, row: row + 1, column: header || columnLetter(col), columnLetter: columnLetter(col), raw };
}

const isBlank = (row: RawCell[]) => row.every((c) => cellText(c) === "");

export function normalize(
  files: RawFile[],
  mappings: Record<string, SheetMapping>,
  treatments: Record<string, AccountTreatment>,
): NormalizeResult {
  const log = new IssueLog();
  const out: NormalizeResult = { pnl: [], cash: [], mrr: [], drivers: [], accounts: [], issues: [] };
  const accounts = new Map<string, AccountInfo>();

  for (const file of files) {
    for (const sheet of file.sheets) {
      const m = mappings[sheet.id];
      if (!m || m.kind === "ignore") continue;
      const kind = m.kind;
      const loc = { file: file.name, sheet: sheet.name };
      const header = sheet.rows[m.headerRow] ?? [];
      const headerText = (c: number) => cellText(header[c] ?? null);
      const col = (f: string) => (m.columns as Record<string, number | null | undefined>)[f] ?? null;

      const missing = requiredMissing(m);
      if (missing.length) {
        log.add({ severity: "error", code: "mapping_incomplete", dataset: kind, ...loc, message: `Required fields are not mapped: ${missing.join(", ")}. The sheet is not used until they are mapped.` });
        continue;
      }

      const currencyOf = (row: RawCell[], r: number): string | null => {
        const c = col("currency");
        if (c !== null) {
          const v = cellText(row[c] ?? null).toUpperCase();
          if (isCurrencyCode(v)) return v;
          if (v) log.add({ severity: "error", code: "bad_currency", dataset: kind, ...loc, row: r + 1, column: headerText(c), message: `"${v}" is not a supported currency code.` });
        }
        return m.fixedCurrency;
      };

      const amount = (
        row: RawCell[],
        r: number,
        c: number,
        allowPercent = false,
        ctx: Pick<Issue, "scenario" | "period" | "account"> = {},
      ): number | null | "error" => {
        const raw = row[c] ?? null;
        const p = parseAmount(raw, { allowPercent });
        if ("error" in p) {
          log.add({ severity: "error", code: "not_numeric", dataset: kind, ...ctx, ...loc, row: r + 1, column: headerText(c) || columnLetter(c), message: `${p.error}. The value is excluded, so figures for this month are unverified.` });
          return "error";
        }
        if ("empty" in p) return null;
        if (p.note) log.note(`${file.id}|${sheet.id}|${c}`, `"${cellText(raw)}" → ${p.value}`, { severity: "info", code: "value_converted", dataset: kind, ...loc, column: headerText(c) || columnLetter(c) });
        return p.value;
      };

      const period = (raw: RawCell, r: number, c: number): string | null => {
        const p = parsePeriod(raw);
        if ("error" in p) {
          log.add({ severity: "error", code: "bad_period", dataset: kind, ...loc, row: r + 1, column: headerText(c) || columnLetter(c), message: `${p.error}. The row is excluded.` });
          return null;
        }
        if (p.note) log.add({ severity: "warning", code: "period_interpreted", dataset: kind, ...loc, row: r + 1, column: headerText(c), period: p.period, message: p.note });
        return p.period;
      };

      if (m.kind === "pnl") {
        const accountCol = col("account")!;
        const periodCols: { c: number; period: string }[] = [];
        if (m.layout === "wide") {
          for (const c of m.periodColumns) {
            const p = period(header[c] ?? null, m.headerRow, c);
            if (p) periodCols.push({ c, period: p });
          }
        }
        for (let r = m.headerRow + 1; r < sheet.rows.length; r++) {
          const row = sheet.rows[r];
          if (isBlank(row)) continue;
          const account = cellText(row[accountCol] ?? null);
          const categoryRaw = col("category") !== null ? cellText(row[col("category")!] ?? null) || null : null;
          const cells = m.layout === "wide" ? periodCols.map((pc) => ({ c: pc.c, period: pc.period as string | null })) : [{ c: col("amount")!, period: period(row[col("period")!] ?? null, r, col("period")!) }];
          const hasNumbers = cells.some(({ c }) => "value" in parseAmount(row[c] ?? null));
          if (!account) {
            if (hasNumbers) log.add({ severity: "error", code: "missing_account", dataset: "pnl", ...loc, row: r + 1, message: "Row has amounts but no account name. The row is excluded." });
            continue;
          }
          if (!hasNumbers && m.layout === "wide") continue; // section heading rows such as "Operating expenses"

          if (!accounts.has(account)) accounts.set(account, { name: account, category: categoryRaw, suggested: guessTreatment(account, categoryRaw) });
          const treatment = treatments[account] ?? accounts.get(account)!.suggested;
          if (treatment === "exclude") continue;

          let scenario = m.fixedScenario;
          if (col("scenario") !== null) {
            const s = guessScenario(cellText(row[col("scenario")!] ?? null));
            if (!s) {
              log.add({ severity: "error", code: "bad_scenario", dataset: "pnl", ...loc, row: r + 1, column: headerText(col("scenario")!), message: `"${cellText(row[col("scenario")!] ?? null)}" is not Actual, Budget or Prior. The row is excluded.` });
              continue;
            }
            scenario = s;
          }
          if (!scenario) continue;
          const currency = currencyOf(row, r);

          for (const { c, period: p } of cells) {
            if (!p) continue;
            const a = amount(row, r, c, false, { scenario, period: p, account });
            if (a === "error") continue;
            if (a === null) {
              log.add({ severity: "warning", code: "missing_value", dataset: "pnl", scenario, period: p, account, ...loc, row: r + 1, column: headerText(c) || columnLetter(c), message: `No ${scenario} amount for "${account}" in ${p}. Totals for this month are unverified until it is filled in.` });
              continue;
            }
            let value = a;
            if (m.costsNegative && COST_TREATMENTS.has(treatment) && value < 0) {
              value = -value;
              log.note(`${file.id}|${sheet.id}|sign`, `${a} → ${value} (costs stored as negatives)`, { severity: "info", code: "sign_converted", dataset: "pnl", ...loc });
            }
            out.pnl.push({ scenario, period: p, account, treatment, amount: value, currency, source: source(file, sheet, r, c, headerText(c), row[c] ?? null) });
          }
        }
      }

      if (m.kind === "cash" || m.kind === "mrr") {
        const fields = (m.kind === "cash" ? ["opening", "operating", "investing", "financing", "net", "ending"] : ["starting", "new", "expansion", "contraction", "churn", "ending"]) as string[];
        for (let r = m.headerRow + 1; r < sheet.rows.length; r++) {
          const row = sheet.rows[r];
          if (isBlank(row)) continue;
          const pc = col("period")!;
          const p = period(row[pc] ?? null, r, pc);
          if (!p) continue;
          const values: Record<string, number> = {};
          const sources: Record<string, SourceCell> = { period: source(file, sheet, r, pc, headerText(pc), row[pc] ?? null) };
          for (const f of fields) {
            const c = col(f);
            if (c === null) continue;
            const a = amount(row, r, c, false, { period: p });
            if (a === "error") continue;
            if (a === null) {
              const required = m.kind === "cash" ? f === "ending" : ["new", "expansion", "contraction", "churn"].includes(f);
              // Only required fields taint the month; an empty optional component is reported but not relied on.
              log.add({ severity: required ? "error" : "warning", code: required ? "missing_value" : "missing_optional", dataset: kind, period: p, ...loc, row: r + 1, column: headerText(c), message: `${headerText(c) || f} is empty for ${p}.${required ? " Figures for this month are unverified." : " Checks that need it are skipped."}` });
              continue;
            }
            let value = a;
            if (m.kind === "mrr" && m.lossesNegative && (f === "contraction" || f === "churn") && value < 0) {
              value = -value;
              log.note(`${file.id}|${sheet.id}|loss`, `${a} → ${value} (contraction and churn stored as negatives)`, { severity: "info", code: "sign_converted", dataset: "mrr", ...loc });
            }
            values[f] = value;
            sources[f] = source(file, sheet, r, c, headerText(c), row[c] ?? null);
          }
          const currency = currencyOf(row, r);
          if (m.kind === "cash") out.cash.push({ period: p, values, currency, sources: sources as Partial<Record<CashField, SourceCell>> });
          else out.mrr.push({ period: p, values, currency, sources: sources as Partial<Record<MrrField, SourceCell>> });
        }
      }

      if (m.kind === "drivers") {
        const dc = col("driver")!;
        for (let r = m.headerRow + 1; r < sheet.rows.length; r++) {
          const row = sheet.rows[r];
          if (isBlank(row)) continue;
          const name = cellText(row[dc] ?? null);
          if (!name) continue;
          const key = guessDriver(name);
          if (!key) {
            log.add({ severity: "info", code: "driver_unknown", dataset: "drivers", ...loc, row: r + 1, message: `Driver "${name}" is not used by the forecast model and is ignored.` });
            continue;
          }
          const d: DriverRow = { key, name, values: {}, sources: {} };
          for (const s of ["base", "upside", "downside"] as ForecastScenario[]) {
            const c = col(s);
            if (c === null) continue;
            const a = amount(row, r, c, DRIVER_DEFS[key].unit === "percent");
            if (a === "error" || a === null) continue;
            d.values[s] = a;
            d.sources[s] = source(file, sheet, r, c, headerText(c), row[c] ?? null);
          }
          out.drivers.push(d);
        }
      }
    }
  }

  out.accounts = [...accounts.values()];
  out.issues = log.flush();
  return out;
}

export function requiredMissing(m: SheetMapping): string[] {
  const cols = m.columns as Record<string, number | null | undefined>;
  const need: Record<string, string[]> = {
    pnl: m.layout === "wide" ? ["account"] : ["account", "period", "amount"],
    cash: ["period", "ending"],
    mrr: ["period", "new", "expansion", "contraction", "churn"],
    drivers: ["driver", "base", "upside", "downside"],
  };
  const missing = (need[m.kind] ?? []).filter((f) => cols[f] == null);
  if (m.kind === "pnl" && m.layout === "wide" && m.periodColumns.length === 0) missing.push("month columns");
  if (m.kind === "pnl" && cols.scenario == null && !m.fixedScenario) missing.push("scenario");
  return missing;
}
