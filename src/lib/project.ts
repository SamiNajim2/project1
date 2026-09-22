import { DRIVER_DEFS } from "./fields";
import {
  FORECAST_SCENARIOS,
  type AccountTreatment,
  type AnalysisInput,
  type DriverKey,
  type DriverSet,
  type DriverValue,
  type ForecastScenario,
  type PnlRecord,
  type ProjectSettings,
  type RawFile,
  type SheetMapping,
} from "./model";
import type { NarrativeDoc, NarrativeKind } from "./narrative/tokens";
import { normalize, type NormalizeResult } from "./normalize";
import { addMonths } from "./periods";
import { validate } from "./validate";

export const STEPS = [
  { id: "setup", label: "Company & period" },
  { id: "import", label: "Import files" },
  { id: "mapping", label: "Map columns" },
  { id: "quality", label: "Data quality" },
  { id: "variance", label: "Variance" },
  { id: "forecast", label: "Forecast & runway" },
  { id: "mrr", label: "MRR bridge" },
  { id: "reports", label: "Investor update & board pack" },
  { id: "register", label: "Verification & export" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export interface ReviewSignoff {
  reviewer: string;
  reviewedAt: string;
  /** Fingerprint of everything that was reviewed; any later change requires a new review. */
  fingerprint: string;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
  settings: ProjectSettings;
  files: RawFile[];
  mappings: Record<string, SheetMapping>;
  treatments: Record<string, AccountTreatment>;
  driverEdits: Partial<Record<ForecastScenario, Partial<Record<DriverKey, { value: number; editedAt: string }>>>>;
  commentary: string;
  narratives: Partial<Record<NarrativeKind, NarrativeDoc>>;
  review: ReviewSignoff | null;
  step: StepId;
}

export function defaultSettings(): ProjectSettings {
  const now = new Date();
  const last = addMonths(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, -1);
  return { companyName: "", currency: "USD", fyStartMonth: 1, reportingPeriod: last, priorBasis: "prior_year", forecastMonths: 12 };
}

export function emptyProject(id: string): Project {
  const now = new Date().toISOString();
  return { id, createdAt: now, updatedAt: now, settings: defaultSettings(), files: [], mappings: {}, treatments: {}, driverEdits: {}, commentary: "", narratives: {}, review: null, step: "setup" };
}

function monthlyActual(pnl: PnlRecord[], period: string, treatment: string): number | null {
  const rows = pnl.filter((r) => r.scenario === "actual" && r.period === period && r.treatment === treatment);
  return rows.length ? rows.reduce((s, r) => s + r.amount, 0) : null;
}

/** Defaults derived from the data. They are labeled as defaults and stay unverified until a user confirms them. */
function defaultDrivers(pnl: PnlRecord[], settings: ProjectSettings): Record<ForecastScenario, Record<DriverKey, DriverValue>> {
  const rp = settings.reportingPeriod;
  const revs = [0, 1, 2, 3].map((i) => monthlyActual(pnl, addMonths(rp, -i), "revenue"));
  const growths: number[] = [];
  for (let i = 0; i < 3; i++) {
    const cur = revs[i], prev = revs[i + 1];
    if (cur !== null && prev) growths.push(((cur - prev) / prev) * 100);
  }
  const growth = growths.length ? Math.round((growths.reduce((a, b) => a + b, 0) / growths.length) * 10) / 10 : 0;
  const rev = revs[0];
  const cogs = monthlyActual(pnl, rp, "cogs");
  const gm = rev && cogs !== null ? Math.round(((rev - cogs) / rev) * 1000) / 10 : 70;

  const d = (value: number, basis: string): DriverValue => ({ value, origin: { type: "default", basis } });
  const growthBasis = growths.length ? `trailing ${growths.length}-month average actual revenue growth` : "no revenue history";
  const gmBasis = rev && cogs !== null ? "reporting-month actual gross margin" : "placeholder, no actuals";
  return {
    base: { revenueGrowthPct: d(growth, growthBasis), grossMarginPct: d(gm, gmBasis), opexGrowthPct: d(1, "placeholder 1% monthly growth"), otherCashFlow: d(0, "placeholder, no other cash flows") },
    upside: { revenueGrowthPct: d(growth + 2, `${growthBasis} + 2 points`), grossMarginPct: d(gm + 2, `${gmBasis} + 2 points`), opexGrowthPct: d(1, "placeholder 1% monthly growth"), otherCashFlow: d(0, "placeholder, no other cash flows") },
    downside: { revenueGrowthPct: d(growth - 2, `${growthBasis} − 2 points`), grossMarginPct: d(gm - 2, `${gmBasis} − 2 points`), opexGrowthPct: d(1.5, "placeholder 1.5% monthly growth"), otherCashFlow: d(0, "placeholder, no other cash flows") },
  };
}

export function resolveDrivers(project: Project, normalized: NormalizeResult): DriverSet {
  const set = defaultDrivers(normalized.pnl, project.settings);
  for (const row of normalized.drivers) {
    for (const s of FORECAST_SCENARIOS) {
      const v = row.values[s];
      const src = row.sources[s];
      if (v !== undefined && src) set[s][row.key] = { value: v, origin: { type: "file", source: src } };
    }
  }
  for (const s of FORECAST_SCENARIOS) {
    for (const [k, edit] of Object.entries(project.driverEdits[s] ?? {}) as [DriverKey, { value: number; editedAt: string }][]) {
      if (edit && DRIVER_DEFS[k]) set[s][k] = { value: edit.value, origin: { type: "user", editedAt: edit.editedAt } };
    }
  }
  return set;
}

/** Raw files + mappings → validated standard data. Deterministic; the raw files are never modified. */
export function prepareInput(project: Project): { input: AnalysisInput; normalized: NormalizeResult } {
  const normalized = normalize(project.files, project.mappings, project.treatments);
  const validated = validate(normalized, project.settings);
  return {
    normalized,
    input: {
      settings: project.settings,
      pnl: validated.pnl,
      cash: validated.cash,
      mrr: validated.mrr,
      drivers: resolveDrivers(project, normalized),
      issues: validated.issues,
    },
  };
}

/** FNV-1a fingerprint used to invalidate a review when anything reviewed changes. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
