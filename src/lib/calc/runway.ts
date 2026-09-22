import { FORECAST_LABELS } from "../fields";
import type { Figure, ForecastScenario } from "../model";
import { addMonths, periodLabel } from "../periods";
import { derive, type FigureRegistry } from "./figures";
import type { ForecastResult } from "./forecast";

// ---------- Pure runway maths (unit tested) ----------

/** Average monthly net burn: positive when cash is being consumed. */
export function averageNetBurn(netCashFlows: number[]): number {
  if (netCashFlows.length === 0) return 0;
  return -netCashFlows.reduce((a, b) => a + b, 0) / netCashFlows.length;
}

/** Runway in months = current cash ÷ average monthly net burn. Null when the business is not burning cash. */
export function runwayMonths(cash: number, avgBurn: number): number | null {
  if (cash <= 0) return 0;
  if (avgBurn <= 0) return null;
  return cash / avgBurn;
}

/** Months until projected cash first falls below zero (linear within the month), or null if it never does. */
export function cashOutMonth(cash: number, netCashFlows: number[]): number | null {
  if (cash <= 0) return 0;
  let balance = cash;
  for (let i = 0; i < netCashFlows.length; i++) {
    const next = balance + netCashFlows[i];
    if (next < 0) return i + balance / -netCashFlows[i];
    balance = next;
  }
  return null;
}

export interface RunwayResult {
  scenario: ForecastScenario;
  currentCash: Figure;
  averageBurn: Figure;
  runway: Figure;
  projected: Figure;
  cashOutPeriod: string | null;
}

export function buildRunway(reg: FigureRegistry, forecast: ForecastResult, currentCash: Figure, reportingPeriod: string): RunwayResult {
  const s = forecast.scenario;
  const label = FORECAST_LABELS[s];
  const flows = forecast.months.map((m) => m.netCashFlow);
  const horizon = flows.length;
  const averageBurn = derive(reg, {
    id: `runway.${s}.avg_burn`,
    label: `Average monthly net burn — ${label} forecast`,
    kind: "forecast",
    unit: "currency",
    formula: `−(Sum of forecast net cash flow over ${horizon} months ÷ ${horizon})`,
    inputs: flows,
    compute: (v) => averageNetBurn(v),
  });
  const runway = derive(reg, {
    id: `runway.${s}.months`,
    label: `Cash runway — ${label}`,
    kind: "forecast",
    unit: "months",
    formula: "Current cash ÷ Average monthly net burn",
    inputs: [currentCash, averageBurn],
    compute: ([c, b]) => runwayMonths(c, b),
    note: "Not burning cash",
  });
  const projected = derive(reg, {
    id: `runway.${s}.projected`,
    label: `Months until projected cash reaches zero — ${label}`,
    kind: "forecast",
    unit: "months",
    formula: "First forecast month where Current cash + cumulative net cash flow < 0",
    inputs: [currentCash, ...flows],
    compute: ([c, ...f]) => cashOutMonth(c, f),
    note: `Cash stays positive for the ${horizon}-month forecast`,
  });
  const cashOutPeriod = projected.value === null ? null : addMonths(reportingPeriod, Math.ceil(projected.value));
  return { scenario: s, currentCash, averageBurn, runway, projected, cashOutPeriod: cashOutPeriod ? periodLabel(cashOutPeriod) : null };
}
