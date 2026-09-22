import type { Analysis } from "../analysis";
import { DRIVER_DEFS, FORECAST_LABELS } from "../fields";
import { FORECAST_SCENARIOS, type DriverKey, type DriverSet, type Figure } from "../model";
import { periodLabel } from "../periods";

type Cell = string | number | null | undefined;

function csv(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

const status = (f: Figure | null | undefined) => (!f ? "" : f.verified ? "VERIFIED" : "UNVERIFIED");
const reasons = (f: Figure | null | undefined) => (f && !f.verified ? f.reasons.join(" | ") : "");

export function varianceCsv(a: Analysis): string {
  const rows: Cell[][] = [];
  const tables = [a.variance.month.budget, a.variance.month.prior, a.variance.ytd.budget, a.variance.ytd.prior];
  for (const t of tables) {
    for (const l of t.lines) {
      const unverified = [l.actual, l.comparison, l.amount, l.pct].some((f) => !f.verified);
      rows.push([t.title, l.label, l.level, l.actual.value, l.comparison.value, l.amount.value, l.pct.value === null ? null : Math.round(l.pct.value * 10) / 10, l.direction ?? "", unverified ? "UNVERIFIED" : "VERIFIED", [l.actual, l.comparison, l.amount].flatMap((f) => (f.verified ? [] : f.reasons)).join(" | ")]);
    }
  }
  return csv(["table", "line", "level", "actual", "comparison", "variance", "variance_pct", "direction", "status", "unverified_reasons"], rows);
}

export function forecastCsv(a: Analysis): string {
  const rows: Cell[][] = [];
  for (const s of FORECAST_SCENARIOS) {
    for (const m of a.forecast[s].months) {
      const figs = [m.revenue, m.cogs, m.grossProfit, m.opex, m.operatingResult, m.netCashFlow, m.closingCash];
      rows.push([FORECAST_LABELS[s], m.period, ...figs.map((f) => f.value), figs.every((f) => f.verified) ? "VERIFIED" : "UNVERIFIED"]);
    }
  }
  return csv(["scenario", "period", "revenue", "cost_of_revenue", "gross_profit", "operating_expenses", "operating_result", "net_cash_flow", "closing_cash", "status"], rows);
}

export function runwayCsv(a: Analysis): string {
  return csv(
    ["scenario", "current_cash", "average_monthly_net_burn", "runway_months", "months_until_cash_zero", "cash_out_month", "status", "note"],
    FORECAST_SCENARIOS.map((s) => {
      const r = a.runway[s];
      return [FORECAST_LABELS[s], r.currentCash.value, r.averageBurn.value, r.runway.value, r.projected.value, r.cashOutPeriod ?? "", status(r.runway), r.runway.note ?? r.projected.note ?? ""];
    }),
  );
}

export function mrrCsv(a: Analysis): string {
  return csv(
    ["period", "starting_mrr", "new", "expansion", "contraction", "churn", "ending_mrr_bridge", "ending_mrr_reported", "net_new_mrr", "grr_pct", "nrr_pct", "arr", "status", "unverified_reasons"],
    a.mrr.map((b) => [b.period, b.starting.value, b.new.value, b.expansion.value, b.contraction.value, b.churn.value, b.ending.value, b.reportedEnding?.value, b.netNew.value, b.grr.value, b.nrr.value, b.arr.value, status(b.ending), reasons(b.ending)]),
  );
}

export function issuesCsv(a: Analysis): string {
  return csv(
    ["severity", "code", "dataset", "file", "sheet", "row", "column", "period", "account", "message"],
    a.issues.map((i) => [i.severity, i.code, i.dataset, i.file, i.sheet, i.row, i.column, i.period, i.account, i.message]),
  );
}

export function checksCsv(a: Analysis): string {
  return csv(["check", "status", "expected", "actual", "difference", "detail"], a.checks.map((c) => [c.label, c.status, c.expected, c.actual, c.difference, c.detail]));
}

export function registerCsv(a: Analysis): string {
  return csv(
    ["id", "label", "value", "unit", "kind", "period", "status", "unverified_reasons", "formula", "inputs", "sources"],
    Object.values(a.figures).map((f) => [
      f.id,
      f.label,
      f.value,
      f.unit,
      f.kind,
      f.period,
      status(f),
      reasons(f),
      f.formula,
      f.inputs.join(" "),
      f.sources.map((s) => `${s.file} › ${s.sheet} › ${s.column} › ${s.period} › rows ${s.rows.join(",")}`).join(" | "),
    ]),
  );
}

export function assumptionsCsv(drivers: DriverSet): string {
  const rows: Cell[][] = [];
  for (const s of FORECAST_SCENARIOS) {
    for (const k of Object.keys(DRIVER_DEFS) as DriverKey[]) {
      const d = drivers[s][k];
      const origin = d.origin;
      rows.push([
        FORECAST_LABELS[s],
        DRIVER_DEFS[k].label,
        d.value,
        DRIVER_DEFS[k].unit === "percent" ? "%" : "currency",
        origin.type,
        origin.type === "file" ? `${origin.source.file} › ${origin.source.sheet} › ${origin.source.column} › row ${origin.source.row}` : origin.type === "user" ? `Edited ${origin.editedAt}` : origin.basis,
        origin.type === "default" ? "UNVERIFIED (default not confirmed)" : "VERIFIED",
      ]);
    }
  }
  return csv(["scenario", "driver", "value", "unit", "origin", "source", "status"], rows);
}

export const CSV_EXPORTS = [
  { id: "variance", label: "Variance tables", file: "variance.csv", build: varianceCsv },
  { id: "forecast", label: "Forecast (all scenarios)", file: "forecast.csv", build: forecastCsv },
  { id: "runway", label: "Cash runway", file: "runway.csv", build: runwayCsv },
  { id: "mrr", label: "MRR bridge", file: "mrr_bridge.csv", build: mrrCsv },
  { id: "issues", label: "Data-quality issues", file: "data_quality.csv", build: issuesCsv },
  { id: "checks", label: "Reconciliation checks", file: "reconciliation.csv", build: checksCsv },
  { id: "register", label: "Verification register", file: "verification_register.csv", build: registerCsv },
] as const;

export function periodSlug(a: Analysis): string {
  return periodLabel(a.settings.reportingPeriod).toLowerCase().replace(/\s+/g, "-");
}
