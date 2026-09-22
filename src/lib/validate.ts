import { SCENARIO_LABELS } from "./fields";
import type { CashRecord, Issue, MrrRecord, PnlRecord, PnlScenario, ProjectSettings } from "./model";
import type { NormalizeResult } from "./normalize";
import { addMonths, periodGaps, periodLabel } from "./periods";

export interface ValidatedData {
  pnl: PnlRecord[];
  cash: CashRecord[];
  mrr: MrrRecord[];
  issues: Issue[];
}

/** Issue codes that make the matching figures unverified (in addition to every error). */
export const TAINTING_CODES = new Set(["missing_value", "duplicate", "currency_mismatch", "currency_missing"]);

export function validate(data: NormalizeResult, settings: ProjectSettings): ValidatedData {
  const issues: Issue[] = [...data.issues];
  const add = (i: Omit<Issue, "id">) => issues.push({ ...i, id: `V${issues.length + 1}` });

  // Duplicates: the first occurrence is used; later ones are excluded and reported. Nothing is summed silently.
  const seen = new Map<string, PnlRecord>();
  const pnl: PnlRecord[] = [];
  for (const r of data.pnl) {
    const key = `${r.scenario}|${r.period}|${r.account}`;
    const first = seen.get(key);
    if (first) {
      add({
        severity: "error",
        code: "duplicate",
        dataset: "pnl",
        scenario: r.scenario,
        period: r.period,
        account: r.account,
        file: r.source.file,
        sheet: r.source.sheet,
        row: r.source.row,
        column: r.source.column,
        message: `Duplicate ${r.scenario} row for "${r.account}" in ${periodLabel(r.period)} (first seen in ${first.source.sheet} row ${first.source.row}). Only the first is used; the month's totals are unverified until resolved.`,
      });
      continue;
    }
    seen.set(key, r);
    pnl.push(r);
  }

  const dedupe = <T extends CashRecord | MrrRecord>(records: T[], dataset: "cash" | "mrr"): T[] => {
    const byPeriod = new Map<string, T>();
    const kept: T[] = [];
    for (const r of records) {
      const first = byPeriod.get(r.period);
      if (first) {
        add({ severity: "error", code: "duplicate", dataset, period: r.period, file: r.sources.period?.file, sheet: r.sources.period?.sheet, row: r.sources.period?.row, message: `Duplicate ${dataset === "cash" ? "cash" : "MRR"} row for ${periodLabel(r.period)} (first seen in row ${first.sources.period?.row}). Only the first is used; figures for the month are unverified.` });
        continue;
      }
      byPeriod.set(r.period, r);
      kept.push(r);
    }
    return kept.sort((a, b) => a.period.localeCompare(b.period));
  };
  const cash = dedupe(data.cash, "cash");
  const mrr = dedupe(data.mrr, "mrr");

  // Currency: no conversion is ever applied. Anything not in the reporting currency is flagged.
  const flagged = new Set<string>();
  const checkCurrency = (currency: string | null, dataset: "pnl" | "cash" | "mrr", period: string, where: { file?: string; sheet?: string }, scenario?: PnlScenario) => {
    const key = `${dataset}|${scenario ?? ""}|${period}|${currency}`;
    if (flagged.has(key)) return;
    if (currency === null) {
      flagged.add(key);
      add({ severity: "error", code: "currency_missing", dataset, scenario, period, ...where, message: `No currency is stated for ${dataset.toUpperCase()} data in ${periodLabel(period)}. Set the sheet currency in the mapping step.` });
    } else if (currency !== settings.currency) {
      flagged.add(key);
      add({ severity: "error", code: "currency_mismatch", dataset, scenario, period, ...where, message: `${dataset.toUpperCase()} data for ${periodLabel(period)} is in ${currency}, not the reporting currency ${settings.currency}. No FX conversion is applied, so these figures are unverified.` });
    }
  };
  for (const r of pnl) checkCurrency(r.currency, "pnl", r.period, r.source, r.scenario);
  for (const r of cash) checkCurrency(r.currency, "cash", r.period, r.sources.period ?? {});
  for (const r of mrr) checkCurrency(r.currency, "mrr", r.period, r.sources.period ?? {});

  // Period consistency.
  const scenarios: PnlScenario[] = ["actual", "budget", "prior"];
  for (const s of scenarios) {
    const periods = pnl.filter((r) => r.scenario === s).map((r) => r.period);
    if (!periods.length) continue;
    for (const gap of periodGaps(periods)) add({ severity: "warning", code: "period_gap", dataset: "pnl", scenario: s, period: gap, message: `${SCENARIO_LABELS[s]} P&L has no data for ${periodLabel(gap)}, between other months.` });
  }
  for (const [dataset, recs] of [["cash", cash], ["mrr", mrr]] as const) {
    for (const gap of periodGaps(recs.map((r) => r.period))) add({ severity: "warning", code: "period_gap", dataset, period: gap, message: `${dataset === "cash" ? "Cash" : "MRR"} data has no row for ${periodLabel(gap)}.` });
  }
  const future = pnl.filter((r) => r.scenario === "actual" && r.period > settings.reportingPeriod);
  if (future.length) {
    add({ severity: "warning", code: "actuals_after_period", dataset: "pnl", scenario: "actual", message: `${future.length} actual amounts are dated after the reporting period (${periodLabel(settings.reportingPeriod)}). They are kept but not used in this report.` });
  }

  // Coverage of the reporting period.
  const rp = settings.reportingPeriod;
  const has = (s: PnlScenario, p: string) => pnl.some((r) => r.scenario === s && r.period === p);
  if (!has("actual", rp)) add({ severity: "error", code: "no_actuals", dataset: "pnl", scenario: "actual", period: rp, message: `No actual P&L data for the reporting period ${periodLabel(rp)}.` });
  if (pnl.some((r) => r.scenario === "budget") && !has("budget", rp)) add({ severity: "error", code: "no_budget", dataset: "pnl", scenario: "budget", period: rp, message: `No budget for the reporting period ${periodLabel(rp)}.` });
  const priorPeriod = settings.priorBasis === "prior_year" ? addMonths(rp, -12) : addMonths(rp, -1);
  const priorScenario: PnlScenario = settings.priorBasis === "prior_year" ? "prior" : "actual";
  if (pnl.some((r) => r.scenario === priorScenario) && !has(priorScenario, priorPeriod)) {
    add({ severity: "warning", code: "no_prior", dataset: "pnl", scenario: priorScenario, period: priorPeriod, message: `No comparison data for ${periodLabel(priorPeriod)}, so the variance against the prior period cannot be calculated.` });
  }
  if (cash.length && !cash.some((r) => r.period === rp)) add({ severity: "warning", code: "no_cash", dataset: "cash", period: rp, message: `No cash balance for ${periodLabel(rp)}. Runway uses the latest month available only if you move the reporting period.` });
  if (mrr.length && !mrr.some((r) => r.period === rp)) add({ severity: "warning", code: "no_mrr", dataset: "mrr", period: rp, message: `No MRR movements for ${periodLabel(rp)}.` });

  return { pnl, cash, mrr, issues };
}

/** Reasons a slice of data cannot be trusted: every error, plus the tainting warnings, that match it. */
export function taintReasons(issues: Issue[], q: { dataset: Issue["dataset"]; scenario?: PnlScenario; period?: string; account?: string }): string[] {
  return issues
    .filter((i) => (i.severity === "error" || TAINTING_CODES.has(i.code)) && i.dataset === q.dataset)
    .filter((i) => i.code !== "mapping_incomplete" && i.code !== "no_prior")
    .filter((i) => !i.scenario || !q.scenario || i.scenario === q.scenario)
    .filter((i) => !i.period || !q.period || i.period === q.period)
    .filter((i) => !i.account || !q.account || i.account === q.account)
    .map((i) => i.message);
}
