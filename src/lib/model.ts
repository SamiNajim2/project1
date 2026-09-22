// ---------- Raw import (never modified after import) ----------

export type RawCell = string | number | boolean | null;

export interface RawSheet {
  id: string;
  name: string;
  /** Every non-empty row exactly as parsed. Date cells are stored as ISO dates (YYYY-MM-DD). */
  rows: RawCell[][];
  truncated: boolean;
}

export interface RawFile {
  id: string;
  name: string;
  size: number;
  format: "xlsx" | "csv";
  importedAt: string;
  sheets: RawSheet[];
}

// ---------- Standard finance data model ----------

export type DatasetKind = "pnl" | "cash" | "mrr" | "drivers";
export type PnlScenario = "actual" | "budget" | "prior";
export type Category = "revenue" | "cogs" | "opex" | "other_income" | "other_expense";
export type SubtotalKind = "revenue" | "cogs" | "gross_profit" | "opex" | "operating_result";
/** How an account is treated: a line in a category, a reported subtotal used only for reconciliation, or excluded. */
export type AccountTreatment = Category | `subtotal:${SubtotalKind}` | "exclude";

export type CashField = "period" | "opening" | "operating" | "investing" | "financing" | "net" | "ending" | "currency";
export type MrrField = "period" | "starting" | "new" | "expansion" | "contraction" | "churn" | "ending" | "currency";
export type PnlField = "period" | "account" | "category" | "amount" | "scenario" | "currency";
export type DriverField = "driver" | "base" | "upside" | "downside";
export type AnyField = CashField | MrrField | PnlField | DriverField;

export interface SheetMapping {
  kind: DatasetKind | "ignore";
  /** Zero-based index of the header row within RawSheet.rows. */
  headerRow: number;
  /** P&L only. "wide" = one column per month. */
  layout: "long" | "wide";
  /** Column index per standard field (null = not mapped). */
  columns: Partial<Record<AnyField, number | null>>;
  /** Wide P&L: the columns that hold monthly amounts. */
  periodColumns: number[];
  /** P&L without a scenario column: the scenario of every row. */
  fixedScenario: PnlScenario | null;
  /** Used when there is no currency column. */
  fixedCurrency: string | null;
  /** P&L: costs stored as negative numbers are converted to positive (logged). */
  costsNegative: boolean;
  /** MRR: contraction and churn stored as negative numbers are converted to magnitudes (logged). */
  lossesNegative: boolean;
}

export interface SourceCell {
  file: string;
  sheet: string;
  /** 1-based row number as shown in Excel. */
  row: number;
  column: string;
  columnLetter: string;
  raw: RawCell;
}

export interface PnlRecord {
  scenario: PnlScenario;
  period: string;
  account: string;
  treatment: AccountTreatment;
  amount: number;
  currency: string | null;
  source: SourceCell;
}

export interface CashRecord {
  period: string;
  values: Partial<Record<Exclude<CashField, "period" | "currency">, number>>;
  currency: string | null;
  sources: Partial<Record<CashField, SourceCell>>;
}

export interface MrrRecord {
  period: string;
  values: Partial<Record<Exclude<MrrField, "period" | "currency">, number>>;
  currency: string | null;
  sources: Partial<Record<MrrField, SourceCell>>;
}

export type ForecastScenario = "base" | "upside" | "downside";
export const FORECAST_SCENARIOS: ForecastScenario[] = ["base", "upside", "downside"];

export type DriverKey = "revenueGrowthPct" | "grossMarginPct" | "opexGrowthPct" | "otherCashFlow";

export interface DriverValue {
  value: number;
  /** Where the value came from: a file cell, a user edit, or a system default. */
  origin: { type: "file"; source: SourceCell } | { type: "user"; editedAt: string } | { type: "default"; basis: string };
}

export type DriverSet = Record<ForecastScenario, Record<DriverKey, DriverValue>>;

export interface ProjectSettings {
  companyName: string;
  currency: string;
  /** 1 = January. */
  fyStartMonth: number;
  /** YYYY-MM, the month being reported on. */
  reportingPeriod: string;
  priorBasis: "prior_year" | "prior_month";
  forecastMonths: number;
}

/** Everything the deterministic analysis needs. Built from raw data + mappings; safe to send to the server. */
export interface AnalysisInput {
  settings: ProjectSettings;
  pnl: PnlRecord[];
  cash: CashRecord[];
  mrr: MrrRecord[];
  drivers: DriverSet;
  issues: Issue[];
}

// ---------- Validation ----------

export type Severity = "error" | "warning" | "info";

export interface Issue {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  dataset?: DatasetKind;
  scenario?: PnlScenario;
  period?: string;
  account?: string;
  file?: string;
  sheet?: string;
  row?: number;
  column?: string;
}

// ---------- Figures and verification ----------

export type FigureUnit = "currency" | "percent" | "months" | "ratio";
/** Visual class: actuals, comparison data, forecasts and assumptions are kept separate. */
export type FigureKind = "actual" | "budget" | "prior" | "forecast" | "assumption" | "derived";

export interface SourceRef {
  file: string;
  sheet: string;
  column: string;
  period: string;
  rows: number[];
}

export interface Figure {
  id: string;
  label: string;
  value: number | null;
  unit: FigureUnit;
  kind: FigureKind;
  period?: string;
  formula: string;
  inputs: string[];
  sources: SourceRef[];
  verified: boolean;
  reasons: string[];
  /** Shown instead of a value when the figure is legitimately not applicable (e.g. "Not burning cash"). */
  note?: string;
}

export interface ReconciliationCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "skipped";
  expected: number | null;
  actual: number | null;
  difference: number | null;
  detail: string;
  affects: string[];
}
