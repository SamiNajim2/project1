import type { AnyField, Category, DatasetKind, DriverKey, ForecastScenario, PnlScenario, SubtotalKind } from "./model";

export interface FieldDef {
  field: AnyField;
  label: string;
  required: boolean;
  aliases: string[];
  hint?: string;
}

export const DATASET_LABELS: Record<DatasetKind | "ignore", string> = {
  pnl: "P&L (actual, budget or prior)",
  cash: "Cash balance & cash flow",
  mrr: "MRR movements",
  drivers: "Forecast drivers",
  ignore: "Ignore this sheet",
};

export const FIELDS: Record<DatasetKind, FieldDef[]> = {
  pnl: [
    { field: "account", label: "Account / line item", required: true, aliases: ["account", "line item", "gl account", "account name", "description", "item", "line"] },
    { field: "period", label: "Period (month)", required: true, aliases: ["period", "month", "date", "month end", "period end", "fiscal period"], hint: "Long layout only" },
    { field: "amount", label: "Amount", required: true, aliases: ["amount", "value", "actual", "budget", "total", "balance"], hint: "Long layout only" },
    { field: "category", label: "Category", required: false, aliases: ["category", "account type", "class", "group", "type"] },
    { field: "scenario", label: "Scenario (actual/budget/prior)", required: false, aliases: ["scenario", "version", "data type", "source"] },
    { field: "currency", label: "Currency", required: false, aliases: ["currency", "ccy", "curr"] },
  ],
  cash: [
    { field: "period", label: "Period (month)", required: true, aliases: ["period", "month", "date", "month end"] },
    { field: "ending", label: "Closing cash balance", required: true, aliases: ["closing cash", "ending cash", "cash balance", "closing balance", "ending balance", "cash at end"] },
    { field: "net", label: "Net cash flow", required: false, aliases: ["net cash flow", "net change in cash", "net cash", "net flow", "net movement"] },
    { field: "opening", label: "Opening cash balance", required: false, aliases: ["opening cash", "opening balance", "beginning cash", "starting cash"] },
    { field: "operating", label: "Operating cash flow", required: false, aliases: ["operating cash flow", "cash from operations", "operating", "operating activities"] },
    { field: "investing", label: "Investing cash flow", required: false, aliases: ["investing cash flow", "investing", "investing activities", "capex"] },
    { field: "financing", label: "Financing cash flow", required: false, aliases: ["financing cash flow", "financing", "financing activities"] },
    { field: "currency", label: "Currency", required: false, aliases: ["currency", "ccy"] },
  ],
  mrr: [
    { field: "period", label: "Period (month)", required: true, aliases: ["period", "month", "date"] },
    { field: "new", label: "New MRR", required: true, aliases: ["new mrr", "new business", "new"] },
    { field: "expansion", label: "Expansion MRR", required: true, aliases: ["expansion mrr", "expansion", "upsell", "upgrades"] },
    { field: "contraction", label: "Contraction MRR", required: true, aliases: ["contraction mrr", "contraction", "downgrade", "downgrades"] },
    { field: "churn", label: "Churned MRR", required: true, aliases: ["churned mrr", "churn mrr", "churn", "churned", "lost mrr"] },
    { field: "starting", label: "Starting MRR", required: false, aliases: ["starting mrr", "opening mrr", "beginning mrr", "start mrr", "mrr start"] },
    { field: "ending", label: "Ending MRR (reported)", required: false, aliases: ["ending mrr", "closing mrr", "end mrr", "mrr end"] },
    { field: "currency", label: "Currency", required: false, aliases: ["currency", "ccy"] },
  ],
  drivers: [
    { field: "driver", label: "Driver name", required: true, aliases: ["driver", "assumption", "parameter", "name", "metric"] },
    { field: "base", label: "Base value", required: true, aliases: ["base", "base case"] },
    { field: "upside", label: "Upside value", required: true, aliases: ["upside", "bull", "best case"] },
    { field: "downside", label: "Downside value", required: true, aliases: ["downside", "bear", "worst case"] },
  ],
};

export const CATEGORY_LABELS: Record<Category, string> = {
  revenue: "Revenue",
  cogs: "Cost of revenue",
  opex: "Operating expenses",
  other_income: "Other income",
  other_expense: "Other expense",
};

export const SUBTOTAL_LABELS: Record<SubtotalKind, string> = {
  revenue: "Total revenue",
  cogs: "Total cost of revenue",
  gross_profit: "Gross profit",
  opex: "Total operating expenses",
  operating_result: "Operating result",
};

export const SCENARIO_LABELS: Record<PnlScenario, string> = { actual: "Actual", budget: "Budget", prior: "Prior period" };
export const FORECAST_LABELS: Record<ForecastScenario, string> = { base: "Base", upside: "Upside", downside: "Downside" };

export const DRIVER_DEFS: Record<DriverKey, { label: string; unit: "percent" | "currency"; aliases: string[]; help: string }> = {
  revenueGrowthPct: {
    label: "Revenue growth, month on month",
    unit: "percent",
    aliases: ["revenue growth", "mom revenue growth", "revenue growth mom", "growth"],
    help: "Revenue each month = previous month × (1 + growth)",
  },
  grossMarginPct: {
    label: "Gross margin",
    unit: "percent",
    aliases: ["gross margin", "gm", "gross margin %"],
    help: "Cost of revenue = revenue × (1 − gross margin)",
  },
  opexGrowthPct: {
    label: "Operating expense growth, month on month",
    unit: "percent",
    aliases: ["opex growth", "operating expense growth", "cost growth", "opex growth mom"],
    help: "Opex each month = previous month × (1 + growth)",
  },
  otherCashFlow: {
    label: "Other cash flow per month",
    unit: "currency",
    aliases: ["other cash flow", "capex and working capital", "non-operating cash flow", "other cash"],
    help: "Added to operating result to get net cash flow (negative = outflow)",
  },
};

/** Normalises header text for alias matching. */
export function normaliseHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

export function matchAlias(header: string, aliases: string[]): number {
  const h = normaliseHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const alias of aliases) {
    if (h === alias) best = Math.max(best, 3);
    else if (h.startsWith(alias) || h.endsWith(alias)) best = Math.max(best, 2);
    else if (alias.length > 3 && h.includes(alias)) best = Math.max(best, 1);
  }
  return best;
}

export function guessScenario(text: string): PnlScenario | null {
  const t = text.toLowerCase();
  if (/budget|plan\b|target/.test(t)) return "budget";
  if (/prior|previous|last year|\bpy\b|comparative/.test(t)) return "prior";
  if (/actual|act\b|\bytd\b/.test(t)) return "actual";
  return null;
}

export function guessKind(sheetName: string, headers: string[]): DatasetKind | "ignore" {
  const name = sheetName.toLowerCase();
  const joined = headers.join(" ").toLowerCase();
  if (/notes|readme|instructions|cover|about/.test(name)) return "ignore";
  if (/mrr|arr|recurring/.test(name) || /churn/.test(joined)) return "mrr";
  if (/cash/.test(name) || /closing cash|cash balance|ending cash/.test(joined)) return "cash";
  if (/driver|assumption|forecast/.test(name) || (/\bbase\b/.test(joined) && /upside/.test(joined))) return "drivers";
  return "pnl";
}

export function guessDriver(name: string): DriverKey | null {
  let best: DriverKey | null = null;
  let score = 0;
  for (const [key, def] of Object.entries(DRIVER_DEFS) as [DriverKey, (typeof DRIVER_DEFS)[DriverKey]][]) {
    const s = matchAlias(name, def.aliases);
    if (s > score) {
      score = s;
      best = key;
    }
  }
  return best;
}

export function guessTreatment(account: string, category: string | null): import("./model").AccountTreatment {
  const a = account.toLowerCase();
  if (/^total\b|\btotal$/.test(a) || /gross profit|operating (income|result|profit)|ebitda|net (income|profit)/.test(a)) {
    if (/gross profit/.test(a)) return "subtotal:gross_profit";
    if (/operating (income|result|profit)|ebitda/.test(a)) return "subtotal:operating_result";
    if (/revenue|sales|income/.test(a) && !/cost/.test(a)) return "subtotal:revenue";
    if (/cost of (revenue|sales|goods)|cogs|direct cost/.test(a)) return "subtotal:cogs";
    if (/opex|operating expense|overhead|expenses/.test(a)) return "subtotal:opex";
    return "exclude";
  }
  const c = (category ?? "").toLowerCase();
  const text = `${c} ${a}`;
  if (/other income|interest income/.test(text)) return "other_income";
  if (/other expense|interest expense|tax/.test(text)) return "other_expense";
  if (/cogs|cost of (revenue|sales|goods)|direct cost|hosting|cost of service|payment processing/.test(text)) return "cogs";
  if (/revenue|sales|subscription|services|income/.test(c || a)) return "revenue";
  return "opex";
}
