import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runAnalysis } from "./analysis";
import { autoMap, suggestSettings } from "./import/auto";
import { parseWorkbookData } from "./import/parse";
import { emptyProject, prepareInput } from "./project";

// End-to-end check of the demo workflow on the generated sample files (npm run samples:generate).
function loadSample() {
  const dir = "public/samples/";
  const files = [
    parseWorkbookData("brightwave_pnl_fy2026.xlsx", new Uint8Array(readFileSync(`${dir}brightwave_pnl_fy2026.xlsx`)), 1),
    parseWorkbookData("brightwave_cash_2026.csv", readFileSync(`${dir}brightwave_cash_2026.csv`, "utf8"), 1),
    parseWorkbookData("brightwave_mrr_2026.csv", readFileSync(`${dir}brightwave_mrr_2026.csv`, "utf8"), 1),
    parseWorkbookData("brightwave_forecast_drivers.xlsx", new Uint8Array(readFileSync(`${dir}brightwave_forecast_drivers.xlsx`)), 1),
  ];
  const project = emptyProject("sample");
  project.files = files;
  project.mappings = autoMap(files);
  project.settings = { ...project.settings, ...suggestSettings(files, project.mappings, project.settings) };
  return project;
}

describe("sample workflow", () => {
  const project = loadSample();
  const { input, normalized } = prepareInput(project);
  const a = runAnalysis(input);
  const byName = (name: string) => project.files.flatMap((f) => f.sheets).find((s) => s.name === name)!;

  it("detects sheets, layouts and settings", () => {
    expect(project.settings).toMatchObject({ companyName: "Brightwave Analytics", currency: "USD", reportingPeriod: "2026-06" });
    expect(project.mappings[byName("Actuals FY26").id]).toMatchObject({ kind: "pnl", layout: "wide", fixedScenario: "actual", headerRow: 2 });
    expect(project.mappings[byName("Budget FY26").id]).toMatchObject({ kind: "pnl", fixedScenario: "budget" });
    expect(project.mappings[byName("Prior Year FY25").id]).toMatchObject({ kind: "pnl", fixedScenario: "prior" });
    expect(project.mappings[byName("Notes").id].kind).toBe("ignore");
    expect(project.mappings[byName("brightwave_cash_2026").id].kind).toBe("cash");
    expect(project.mappings[byName("brightwave_mrr_2026").id].kind).toBe("mrr");
    expect(project.mappings[byName("Drivers").id].kind).toBe("drivers");
  });

  it("keeps the raw files untouched and records exact sources", () => {
    const raw = byName("Actuals FY26").rows;
    expect(raw[0][0]).toBe("Brightwave Analytics — Profit & Loss, actuals (USD)");
    const rec = input.pnl.find((r) => r.scenario === "actual" && r.period === "2026-06" && r.account === "Subscription revenue")!;
    expect(rec.source).toMatchObject({ file: "brightwave_pnl_fy2026.xlsx", sheet: "Actuals FY26", column: "Jun-26", row: 5 });
    expect(rec.source.raw).toBe(rec.amount);
  });

  it("classifies accounts and treats reported totals as reconciliation-only", () => {
    const treatments = Object.fromEntries(normalized.accounts.map((acc) => [acc.name, acc.suggested]));
    expect(treatments).toMatchObject({ "Subscription revenue": "revenue", "Total revenue": "subtotal:revenue", "Hosting & infrastructure": "cogs", "Sales & marketing": "opex" });
  });

  it("reports the planted data-quality issues and nothing blocking", () => {
    expect(input.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(input.issues.some((i) => i.code === "missing_optional" && i.dataset === "cash" && i.period === "2026-03")).toBe(true);
  });

  it("reconciles: P&L subtotals pass, February MRR fails, cash rolls forward", () => {
    expect(a.checks.filter((c) => c.id.startsWith("rec.pnl") && c.status === "fail")).toEqual([]);
    expect(a.checks.some((c) => c.id.startsWith("rec.pnl") && c.status === "pass")).toBe(true);
    expect(a.checks.filter((c) => c.status === "fail").map((c) => c.id)).toEqual(["rec.mrr.2026-02.ending"]);
    expect(a.checks.filter((c) => c.id.startsWith("rec.cash") && c.status === "pass").length).toBeGreaterThan(5);
  });

  it("produces verified figures for the reporting month", () => {
    const f = a.figures;
    for (const id of a.kpis) expect(f[id].verified, `${id}: ${f[id].reasons.join("; ")}`).toBe(true);
    const revenue = a.variance.month.budget.lines.find((l) => l.key === "cat:revenue")!;
    expect(revenue.actual.value).toBeGreaterThan(500_000);
    expect(revenue.comparison.value).toBeGreaterThan(0);
    expect(a.variance.month.prior.lines.find((l) => l.key === "cat:revenue")!.comparison.period).toBe("2025-06");
    expect(a.variance.ytd.budget.lines.find((l) => l.key === "tot:operating_result")!.actual.verified).toBe(true);
  });

  it("marks February's MRR bridge unverified but not June's", () => {
    const feb = a.mrr.find((b) => b.period === "2026-02")!;
    const jun = a.mrr.find((b) => b.period === "2026-06")!;
    expect(feb.ending.verified).toBe(false);
    expect(jun.ending.verified).toBe(true);
    expect(jun.ending.value).toBe(519_277);
  });

  it("builds three forecasts from the imported drivers and a runway for each", () => {
    expect(a.forecast.base.assumptions.revenueGrowthPct).toMatchObject({ value: 3, verified: true });
    expect(a.forecast.downside.assumptions.otherCashFlow.value).toBe(-40_000);
    expect(a.forecast.base.months).toHaveLength(12);
    expect(a.runway.base.currentCash.value).toBe(5_592_945);
    for (const s of ["base", "upside", "downside"] as const) expect(a.runway[s].runway.verified).toBe(true);
  });
});
