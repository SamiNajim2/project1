import { DRIVER_DEFS, FORECAST_LABELS } from "../fields";
import type { DriverKey, DriverSet, DriverValue, Figure, ForecastScenario, SourceRef } from "../model";
import { addMonths, periodLabel } from "../periods";
import { derive, type FigureRegistry } from "./figures";

export interface Drivers {
  revenueGrowthPct: number;
  grossMarginPct: number;
  opexGrowthPct: number;
  otherCashFlow: number;
}

export interface ProjectedMonth {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  operatingResult: number;
  netCashFlow: number;
  closingCash: number;
}

/** Pure driver-based projection (unit tested). Growth rates are percentages, e.g. 3 = 3%. */
export function projectForecast(baseline: { revenue: number; opex: number; cash: number }, d: Drivers, months: number): ProjectedMonth[] {
  const out: ProjectedMonth[] = [];
  let revenue = baseline.revenue;
  let opex = baseline.opex;
  let cash = baseline.cash;
  for (let i = 0; i < months; i++) {
    revenue = revenue * (1 + d.revenueGrowthPct / 100);
    opex = opex * (1 + d.opexGrowthPct / 100);
    const cogs = revenue * (1 - d.grossMarginPct / 100);
    const grossProfit = revenue - cogs;
    const operatingResult = grossProfit - opex;
    const netCashFlow = operatingResult + d.otherCashFlow;
    cash = cash + netCashFlow;
    out.push({ revenue, cogs, grossProfit, opex, operatingResult, netCashFlow, closingCash: cash });
  }
  return out;
}

export interface ForecastMonth {
  period: string;
  revenue: Figure;
  cogs: Figure;
  grossProfit: Figure;
  opex: Figure;
  operatingResult: Figure;
  netCashFlow: Figure;
  closingCash: Figure;
}

export interface ForecastResult {
  scenario: ForecastScenario;
  assumptions: Record<DriverKey, Figure>;
  months: ForecastMonth[];
}

export function assumptionFigure(reg: FigureRegistry, scenario: ForecastScenario, key: DriverKey, dv: DriverValue): Figure {
  const def = DRIVER_DEFS[key];
  let sources: SourceRef[] = [];
  const reasons: string[] = [];
  if (dv.origin.type === "file") {
    const s = dv.origin.source;
    sources = [{ file: s.file, sheet: s.sheet, column: s.column, period: "Assumption", rows: [s.row] }];
  } else if (dv.origin.type === "user") {
    sources = [{ file: "Entered in Finance Analyst", sheet: "Forecast drivers", column: `${FORECAST_LABELS[scenario]}: ${def.label}`, period: `Edited ${dv.origin.editedAt.slice(0, 16).replace("T", " ")}`, rows: [] }];
  } else {
    reasons.push(`Default assumption (${dv.origin.basis}). Confirm or edit it in Forecast drivers.`);
  }
  return reg.add({
    id: `asm.${scenario}.${key}`,
    label: `${def.label} — ${FORECAST_LABELS[scenario]} assumption`,
    value: dv.value,
    unit: def.unit === "percent" ? "percent" : "currency",
    kind: "assumption",
    formula: dv.origin.type === "default" ? `System default: ${dv.origin.basis}` : dv.origin.type === "file" ? "Imported driver value" : "Value entered by a user",
    inputs: [],
    sources,
    verified: reasons.length === 0,
    reasons,
  });
}

export function buildForecast(
  reg: FigureRegistry,
  scenario: ForecastScenario,
  drivers: DriverSet,
  baseline: { period: string; revenue: Figure; opex: Figure; cash: Figure },
  months: number,
): ForecastResult {
  const a = Object.fromEntries(
    (Object.keys(DRIVER_DEFS) as DriverKey[]).map((k) => [k, assumptionFigure(reg, scenario, k, drivers[scenario][k])]),
  ) as Record<DriverKey, Figure>;
  const label = FORECAST_LABELS[scenario];
  const out: ForecastMonth[] = [];
  let prevRevenue = baseline.revenue;
  let prevOpex = baseline.opex;
  let prevCash = baseline.cash;

  for (let i = 1; i <= months; i++) {
    const p = addMonths(baseline.period, i);
    const id = (m: string) => `fc.${scenario}.${p}.${m}`;
    const lbl = (m: string) => `${m} — ${label} forecast, ${periodLabel(p)}`;
    const common = { kind: "forecast" as const, unit: "currency" as const, period: p };
    const revenue = derive(reg, { ...common, id: id("revenue"), label: lbl("Revenue"), formula: `Previous month revenue × (1 + revenue growth)`, inputs: [prevRevenue, a.revenueGrowthPct], compute: ([r, g]) => r * (1 + g / 100) });
    const cogs = derive(reg, { ...common, id: id("cogs"), label: lbl("Cost of revenue"), formula: `Revenue × (1 − gross margin)`, inputs: [revenue, a.grossMarginPct], compute: ([r, gm]) => r * (1 - gm / 100) });
    const grossProfit = derive(reg, { ...common, id: id("gross_profit"), label: lbl("Gross profit"), formula: "Revenue − Cost of revenue", inputs: [revenue, cogs], compute: ([r, c]) => r - c });
    const opex = derive(reg, { ...common, id: id("opex"), label: lbl("Operating expenses"), formula: "Previous month opex × (1 + opex growth)", inputs: [prevOpex, a.opexGrowthPct], compute: ([o, g]) => o * (1 + g / 100) });
    const operatingResult = derive(reg, { ...common, id: id("operating_result"), label: lbl("Operating result"), formula: "Gross profit − Operating expenses", inputs: [grossProfit, opex], compute: ([g, o]) => g - o });
    const netCashFlow = derive(reg, { ...common, id: id("net_cash_flow"), label: lbl("Net cash flow"), formula: "Operating result + Other cash flow per month", inputs: [operatingResult, a.otherCashFlow], compute: ([o, x]) => o + x });
    const closingCash = derive(reg, { ...common, id: id("closing_cash"), label: lbl("Closing cash"), formula: "Previous month closing cash + Net cash flow", inputs: [prevCash, netCashFlow], compute: ([c, n]) => c + n });
    out.push({ period: p, revenue, cogs, grossProfit, opex, operatingResult, netCashFlow, closingCash });
    prevRevenue = revenue;
    prevOpex = opex;
    prevCash = closingCash;
  }
  return { scenario, assumptions: a, months: out };
}
