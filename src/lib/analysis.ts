import { buildCash, type CashMonth } from "./calc/cash";
import { derive, FigureRegistry } from "./calc/figures";
import { buildForecast, type ForecastResult } from "./calc/forecast";
import { buildMrr, type MrrBridge } from "./calc/mrr";
import { buildRunway, type RunwayResult } from "./calc/runway";
import { createPnlContext, lineId, periodFigure, varianceTable, type VarianceTable } from "./calc/variance";
import { FORECAST_SCENARIOS, type AnalysisInput, type Figure, type ForecastScenario, type Issue, type ProjectSettings, type ReconciliationCheck } from "./model";
import { periodLabel } from "./periods";
import { fingerprint } from "./project";

export interface Analysis {
  settings: ProjectSettings;
  figures: Record<string, Figure>;
  checks: ReconciliationCheck[];
  issues: Issue[];
  variance: { month: { budget: VarianceTable; prior: VarianceTable }; ytd: { budget: VarianceTable; prior: VarianceTable } };
  forecast: Record<ForecastScenario, ForecastResult>;
  runway: Record<ForecastScenario, RunwayResult>;
  cash: CashMonth[];
  mrr: MrrBridge[];
  /** Figure IDs of the headline KPIs for the reporting month. */
  kpis: string[];
  summary: { figures: number; verified: number; unverified: number; checksPassed: number; checksFailed: number; checksSkipped: number };
}

/** The whole analysis as pure, deterministic functions of the input. Runs in the browser and on the server. */
export function runAnalysis(input: AnalysisInput): Analysis {
  const { settings, issues } = input;
  const reg = new FigureRegistry();
  const checks: ReconciliationCheck[] = [];
  const rp = settings.reportingPeriod;
  const cur = settings.currency;

  // 1. P&L aggregates, with reported subtotals reconciled before any total is derived.
  const ctx = createPnlContext(reg, input.pnl, issues, settings, checks);
  const variance = {
    month: { budget: varianceTable(ctx, "budget", "month"), prior: varianceTable(ctx, "prior", "month") },
    ytd: { budget: varianceTable(ctx, "budget", "ytd"), prior: varianceTable(ctx, "prior", "ytd") },
  };
  if (!input.pnl.some((r) => r.treatment.startsWith("subtotal:"))) {
    checks.push({ id: "rec.pnl.none", label: "P&L subtotals", status: "skipped", expected: null, actual: null, difference: null, detail: "The source files contain no reported subtotal rows (e.g. \"Total revenue\") to reconcile against.", affects: [] });
  }

  // 2. Cash, reconciled month by month.
  const cash = buildCash(reg, input.cash, issues, cur, checks);
  const currentCash =
    reg.get(`cash.${rp}.ending`) ??
    reg.add({ id: `cash.${rp}.ending`, label: `Closing cash — Actual, ${periodLabel(rp)}`, value: null, unit: "currency", kind: "actual", period: rp, formula: "Closing cash as reported", inputs: [], sources: [], verified: false, reasons: [`No closing cash balance for ${periodLabel(rp)}`] });

  // 3. Forecasts from the reporting month's actuals and the drivers.
  const baselineRevenue = periodFigure(ctx, "actual", [rp], "cat:revenue");
  const baselineOpex = periodFigure(ctx, "actual", [rp], "cat:opex");
  const forecast = {} as Record<ForecastScenario, ForecastResult>;
  const runway = {} as Record<ForecastScenario, RunwayResult>;
  for (const s of FORECAST_SCENARIOS) {
    forecast[s] = buildForecast(reg, s, input.drivers, { period: rp, revenue: baselineRevenue, opex: baselineOpex, cash: currentCash }, settings.forecastMonths);
    runway[s] = buildRunway(reg, forecast[s], currentCash, rp);
  }

  // 4. MRR bridge, reconciled against reported ending MRR.
  const mrr = buildMrr(reg, input.mrr, issues, cur, checks);

  // 5. Headline KPIs for the reporting month.
  const revenue = baselineRevenue;
  const grossProfit = periodFigure(ctx, "actual", [rp], "tot:gross_profit");
  const grossMargin = derive(reg, { id: `kpi.${rp}.gross_margin`, label: `Gross margin — Actual, ${periodLabel(rp)}`, kind: "derived", unit: "percent", period: rp, formula: "Gross profit ÷ Revenue × 100", inputs: [grossProfit, revenue], compute: ([g, r]) => (r === 0 ? null : (g / r) * 100), note: "n/a (no revenue)" });
  const netCash = reg.get(`cash.${rp}.net`);
  const netBurn = netCash
    ? derive(reg, { id: `kpi.${rp}.net_burn`, label: `Net burn — Actual, ${periodLabel(rp)}`, kind: "derived", unit: "currency", period: rp, formula: "−Net cash flow for the month", inputs: [netCash], compute: ([n]) => -n })
    : undefined;
  const mrrNow = mrr.find((b) => b.period === rp);
  const kpis = [
    revenue.id,
    variance.month.budget.lines.find((l) => l.key === "cat:revenue")?.pct.id,
    grossMargin.id,
    lineId("actual", rp, "tot:operating_result"),
    netBurn?.id,
    currentCash.id,
    runway.base.runway.id,
    mrrNow?.ending.id,
    mrrNow?.netNew.id,
    mrrNow?.nrr.id,
    mrrNow?.arr.id,
  ].filter((id): id is string => !!id && !!reg.get(id));

  const figures = reg.toRecord();
  const all = Object.values(figures);
  return {
    settings,
    figures,
    checks,
    issues,
    variance,
    forecast,
    runway,
    cash,
    mrr,
    kpis,
    summary: {
      figures: all.length,
      verified: all.filter((f) => f.verified).length,
      unverified: all.filter((f) => !f.verified).length,
      checksPassed: checks.filter((c) => c.status === "pass").length,
      checksFailed: checks.filter((c) => c.status === "fail").length,
      checksSkipped: checks.filter((c) => c.status === "skipped").length,
    },
  };
}

/** Changes whenever any figure's value or verification changes. */
export function analysisFingerprint(a: Analysis): string {
  return fingerprint(Object.values(a.figures).map((f) => [f.id, f.value, f.verified]));
}
