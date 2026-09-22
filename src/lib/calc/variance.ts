import { CATEGORY_LABELS, SCENARIO_LABELS, SUBTOTAL_LABELS } from "../fields";
import { formatMoney, round2 } from "../format";
import type { Category, Figure, FigureKind, Issue, PnlRecord, PnlScenario, ProjectSettings, ReconciliationCheck, SubtotalKind } from "../model";
import { addMonths, periodLabel, ytdPeriods } from "../periods";
import { derive, leaf, slug, type FigureRegistry } from "./figures";

// ---------- Pure variance maths (unit tested) ----------

/** Actual minus comparison. Positive means the actual is higher. */
export function varianceAmount(actual: number, comparison: number): number {
  return round2(actual - comparison);
}

/** Variance as a percentage of the comparison's magnitude; null when the comparison is zero. */
export function variancePct(actual: number, comparison: number): number | null {
  if (comparison === 0) return null;
  return ((actual - comparison) / Math.abs(comparison)) * 100;
}

export type LineType = "income" | "cost";
export type Direction = "favorable" | "unfavorable" | "neutral";

/** Higher income is favorable; higher cost is unfavorable. */
export function varianceDirection(type: LineType, variance: number): Direction {
  if (Math.abs(variance) < 0.005) return "neutral";
  const up = variance > 0;
  return (type === "income") === up ? "favorable" : "unfavorable";
}

// ---------- P&L aggregation with verification ----------

export const CATEGORY_ORDER: Category[] = ["revenue", "cogs", "opex", "other_income", "other_expense"];
export type TotalKey = "gross_profit" | "operating_result" | "net_result";
export type LineKey = `acct:${string}` | `cat:${Category}` | `tot:${TotalKey}`;

const TOTAL_LABELS: Record<TotalKey, string> = { gross_profit: "Gross profit", operating_result: "Operating result", net_result: "Net result" };
const COST_CATEGORIES = new Set<Category>(["cogs", "opex", "other_expense"]);

export interface PnlContext {
  reg: FigureRegistry;
  pnl: PnlRecord[];
  issues: Issue[];
  settings: ProjectSettings;
  checks: ReconciliationCheck[];
  accountCategory: Map<string, Category>;
  /** Accounts per category in first-seen order. */
  accounts: Map<Category, string[]>;
  done: Set<string>;
}

export function createPnlContext(reg: FigureRegistry, pnl: PnlRecord[], issues: Issue[], settings: ProjectSettings, checks: ReconciliationCheck[]): PnlContext {
  const accountCategory = new Map<string, Category>();
  const accounts = new Map<Category, string[]>();
  for (const r of pnl) {
    if (r.treatment.startsWith("subtotal:") || r.treatment === "exclude") continue;
    const cat = r.treatment as Category;
    if (!accountCategory.has(r.account)) {
      accountCategory.set(r.account, cat);
      accounts.set(cat, [...(accounts.get(cat) ?? []), r.account]);
    }
  }
  return { reg, pnl, issues, settings, checks, accountCategory, accounts, done: new Set() };
}

const kindOf = (s: PnlScenario): FigureKind => (s === "actual" ? "actual" : s);
const scenarioText = (s: PnlScenario) => SCENARIO_LABELS[s];

function sliceReasons(ctx: PnlContext, s: PnlScenario, p: string, filter: (account: string | undefined) => boolean): string[] {
  return ctx.issues
    .filter((i) => i.dataset === "pnl" && (i.severity === "error" || ["missing_value", "duplicate", "currency_mismatch", "currency_missing"].includes(i.code)))
    .filter((i) => !["mapping_incomplete", "no_prior"].includes(i.code))
    .filter((i) => !i.scenario || i.scenario === s)
    .filter((i) => !i.period || i.period === p)
    .filter((i) => filter(i.account))
    .map((i) => i.message);
}

function splitLine(line: LineKey): [string, string] {
  const i = line.indexOf(":");
  return [line.slice(0, i), line.slice(i + 1)];
}

export function lineId(s: PnlScenario, periodKey: string, line: LineKey): string {
  const [type, name] = splitLine(line);
  return `pnl.${s}.${periodKey}.${type}.${type === "acct" ? slug(name) : name}`;
}

function lineLabel(line: LineKey): string {
  const [type, name] = splitLine(line);
  if (type === "acct") return name;
  if (type === "cat") return CATEGORY_LABELS[name as Category];
  return TOTAL_LABELS[name as TotalKey];
}

export function lineType(ctx: PnlContext, line: LineKey): "income" | "cost" {
  const [type, name] = splitLine(line);
  if (type === "acct") return COST_CATEGORIES.has(ctx.accountCategory.get(name)!) ? "cost" : "income";
  if (type === "cat") return COST_CATEGORIES.has(name as Category) ? "cost" : "income";
  return "income";
}

/** Builds every monthly figure for one scenario and month, reconciling reported subtotals before deriving totals. */
function buildMonth(ctx: PnlContext, s: PnlScenario, p: string) {
  const key = `${s}|${p}`;
  if (ctx.done.has(key)) return;
  ctx.done.add(key);
  const { reg } = ctx;
  const records = ctx.pnl.filter((r) => r.scenario === s && r.period === p);
  const label = `${scenarioText(s)}, ${periodLabel(p)}`;

  for (const account of ctx.accountCategory.keys()) {
    const cells = records.filter((r) => r.account === account).map((r) => ({ amount: r.amount, source: r.source, period: p }));
    leaf(reg, {
      id: lineId(s, p, `acct:${account}`),
      label: `${account} — ${label}`,
      kind: kindOf(s),
      period: p,
      formula: `Sum of ${scenarioText(s)} amounts for "${account}" in ${periodLabel(p)}`,
      cells,
      reasons: sliceReasons(ctx, s, p, (a) => !a || a === account),
      missingReason: `No ${scenarioText(s).toLowerCase()} line for "${account}" in ${periodLabel(p)}`,
    });
  }

  const catFig = {} as Record<Category, Figure>;
  for (const cat of CATEGORY_ORDER) {
    const members = new Set(ctx.accounts.get(cat) ?? []);
    const cells = records.filter((r) => r.treatment === cat).map((r) => ({ amount: r.amount, source: r.source, period: p }));
    const reasons = sliceReasons(ctx, s, p, (a) => !a || members.has(a));
    const id = lineId(s, p, `cat:${cat}`);
    const figLabel = `${CATEGORY_LABELS[cat]} — ${label}`;
    if (cells.length === 0 && records.length > 0 && (cat === "other_income" || cat === "other_expense")) {
      // Optional categories with no lines in a month that has data are a true zero.
      catFig[cat] = reg.add({ id, label: figLabel, value: 0, unit: "currency", kind: kindOf(s), period: p, formula: `No ${CATEGORY_LABELS[cat].toLowerCase()} lines in ${scenarioText(s)} data for ${periodLabel(p)}, so 0`, inputs: [], sources: [], verified: reasons.length === 0, reasons });
      continue;
    }
    catFig[cat] = leaf(reg, {
      id,
      label: figLabel,
      kind: kindOf(s),
      period: p,
      formula: `Sum of all ${scenarioText(s)} ${CATEGORY_LABELS[cat].toLowerCase()} lines in ${periodLabel(p)}`,
      cells,
      reasons,
      missingReason: records.length ? `No ${CATEGORY_LABELS[cat].toLowerCase()} lines in ${scenarioText(s).toLowerCase()} data for ${periodLabel(p)}` : `No ${scenarioText(s).toLowerCase()} P&L data for ${periodLabel(p)}`,
    });
  }

  reconcileSubtotals(ctx, s, p, records, { revenue: catFig.revenue, cogs: catFig.cogs, opex: catFig.opex });

  const gp = derive(reg, {
    id: lineId(s, p, "tot:gross_profit"),
    label: `Gross profit — ${label}`,
    kind: kindOf(s),
    unit: "currency",
    period: p,
    formula: "Revenue − Cost of revenue",
    inputs: [catFig.revenue, catFig.cogs],
    compute: ([r, c]) => r - c,
  });
  reconcileSubtotals(ctx, s, p, records, { gross_profit: gp });

  const op = derive(reg, {
    id: lineId(s, p, "tot:operating_result"),
    label: `Operating result — ${label}`,
    kind: kindOf(s),
    unit: "currency",
    period: p,
    formula: "Gross profit − Operating expenses",
    inputs: [gp, catFig.opex],
    compute: ([g, o]) => g - o,
  });
  reconcileSubtotals(ctx, s, p, records, { operating_result: op });

  derive(reg, {
    id: lineId(s, p, "tot:net_result"),
    label: `Net result — ${label}`,
    kind: kindOf(s),
    unit: "currency",
    period: p,
    formula: "Operating result + Other income − Other expense",
    inputs: [op, catFig.other_income, catFig.other_expense],
    compute: ([o, i, e]) => o + i - e,
  });
}

function reconcileSubtotals(ctx: PnlContext, s: PnlScenario, p: string, records: PnlRecord[], computed: Partial<Record<SubtotalKind, Figure>>) {
  for (const [kind, fig] of Object.entries(computed) as [SubtotalKind, Figure][]) {
    for (const r of records.filter((x) => x.treatment === `subtotal:${kind}`)) {
      const id = `rec.pnl.${s}.${p}.${kind}.${r.source.sheet}.${r.source.row}`;
      if (fig.value === null) {
        ctx.checks.push({ id, label: `${SUBTOTAL_LABELS[kind]} (${scenarioText(s)}, ${periodLabel(p)})`, status: "skipped", expected: r.amount, actual: null, difference: null, detail: `Reported "${r.account}" in ${r.source.sheet} row ${r.source.row}; the computed total is not available.`, affects: [fig.id] });
        continue;
      }
      const diff = round2(fig.value - r.amount);
      const pass = Math.abs(diff) < 0.5;
      const cur = ctx.settings.currency;
      const detail = pass
        ? `Reported "${r.account}" (${r.source.sheet} row ${r.source.row}, column ${r.source.column}) matches the sum of the lines.`
        : `Reported "${r.account}" is ${formatMoney(r.amount, cur)} (${r.source.sheet} row ${r.source.row}, column ${r.source.column}) but the lines sum to ${formatMoney(fig.value, cur)}: a difference of ${formatMoney(diff, cur)}.`;
      ctx.checks.push({ id, label: `${SUBTOTAL_LABELS[kind]} (${scenarioText(s)}, ${periodLabel(p)})`, status: pass ? "pass" : "fail", expected: r.amount, actual: fig.value, difference: diff, detail, affects: [fig.id] });
      if (!pass) ctx.reg.flag(fig.id, `Fails reconciliation: ${detail}`);
    }
  }
}

/** Figure for a line over a single month or a range of months (sum of the monthly figures). */
export function periodFigure(ctx: PnlContext, s: PnlScenario, periods: string[], line: LineKey): Figure {
  for (const p of periods) buildMonth(ctx, s, p);
  if (periods.length === 1) return ctx.reg.get(lineId(s, periods[0], line))!;
  const last = periods[periods.length - 1];
  const id = lineId(s, `ytd${last}`, line);
  return (
    ctx.reg.get(id) ??
    derive(ctx.reg, {
      id,
      label: `${lineLabel(line)} — ${scenarioText(s)}, ${periodLabel(periods[0])}–${periodLabel(last)}`,
      kind: kindOf(s),
      unit: "currency",
      period: last,
      formula: `Sum of ${periods.length} monthly figures, ${periodLabel(periods[0])} to ${periodLabel(last)}`,
      inputs: periods.map((p) => ctx.reg.get(lineId(s, p, line))),
      compute: (vals) => vals.reduce((a, b) => a + b, 0),
    })
  );
}

// ---------- Variance tables ----------

export interface VarianceLine {
  key: LineKey;
  label: string;
  level: "account" | "category" | "total";
  type: LineType;
  actual: Figure;
  comparison: Figure;
  amount: Figure;
  pct: Figure;
  direction: Direction | null;
}

export interface VarianceTable {
  basis: "budget" | "prior";
  mode: "month" | "ytd";
  title: string;
  periods: string[];
  comparisonScenario: PnlScenario;
  comparisonPeriods: string[];
  lines: VarianceLine[];
}

export function comparisonFor(settings: ProjectSettings, basis: "budget" | "prior", mode: "month" | "ytd") {
  const periods = mode === "month" ? [settings.reportingPeriod] : ytdPeriods(settings.reportingPeriod, settings.fyStartMonth);
  if (basis === "budget") return { periods, scenario: "budget" as PnlScenario, comparisonPeriods: periods };
  if (mode === "month" && settings.priorBasis === "prior_month") return { periods, scenario: "actual" as PnlScenario, comparisonPeriods: [addMonths(settings.reportingPeriod, -1)] };
  return { periods, scenario: "prior" as PnlScenario, comparisonPeriods: periods.map((p) => addMonths(p, -12)) };
}

export function varianceTable(ctx: PnlContext, basis: "budget" | "prior", mode: "month" | "ytd"): VarianceTable {
  const { periods, scenario, comparisonPeriods } = comparisonFor(ctx.settings, basis, mode);
  const lines: VarianceLine[] = [];
  const cmpName = basis === "budget" ? "budget" : "prior period";
  const range = mode === "month" ? periodLabel(periods[0]) : `YTD ${periodLabel(periods[periods.length - 1])}`;
  const idBase = `var.${basis}.${mode}`;

  const addLine = (line: LineKey, level: VarianceLine["level"]) => {
    const actual = periodFigure(ctx, "actual", periods, line);
    const comparison = periodFigure(ctx, scenario, comparisonPeriods, line);
    const name = lineLabel(line);
    const type = lineType(ctx, line);
    const lineSlug = line.replace(":", ".").replace(/[^a-zA-Z0-9._-]/g, "-");
    const amount = derive(ctx.reg, {
      id: `${idBase}.${lineSlug}.amount`,
      label: `${name}: variance vs ${cmpName}, ${range}`,
      kind: "derived",
      unit: "currency",
      period: periods[periods.length - 1],
      formula: `Actual − ${basis === "budget" ? "Budget" : "Prior period"}`,
      inputs: [actual, comparison],
      compute: ([a, c]) => varianceAmount(a, c),
    });
    const pct = derive(ctx.reg, {
      id: `${idBase}.${lineSlug}.pct`,
      label: `${name}: variance % vs ${cmpName}, ${range}`,
      kind: "derived",
      unit: "percent",
      period: periods[periods.length - 1],
      formula: `(Actual − ${basis === "budget" ? "Budget" : "Prior period"}) ÷ |${basis === "budget" ? "Budget" : "Prior period"}| × 100`,
      inputs: [actual, comparison],
      compute: ([a, c]) => variancePct(a, c),
      note: "n/a (comparison is zero)",
    });
    lines.push({ key: line, label: name, level, type, actual, comparison, amount, pct, direction: amount.value === null ? null : varianceDirection(type, amount.value) });
  };

  const hasCategory = (cat: Category) => (ctx.accounts.get(cat)?.length ?? 0) > 0;
  for (const cat of CATEGORY_ORDER) {
    if (!hasCategory(cat) && !["revenue", "cogs", "opex"].includes(cat)) continue;
    for (const account of ctx.accounts.get(cat) ?? []) addLine(`acct:${account}`, "account");
    addLine(`cat:${cat}`, "category");
    if (cat === "cogs") addLine("tot:gross_profit", "total");
    if (cat === "opex") addLine("tot:operating_result", "total");
  }
  if (hasCategory("other_income") || hasCategory("other_expense")) addLine("tot:net_result", "total");

  return {
    basis,
    mode,
    title: `${range}: actual vs ${cmpName}`,
    periods,
    comparisonScenario: scenario,
    comparisonPeriods,
    lines,
  };
}
