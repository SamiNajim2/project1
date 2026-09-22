import { describe, expect, it } from "vitest";
import { runAnalysis } from "../analysis";
import type { AnalysisInput, PnlRecord, PnlScenario } from "../model";
import { varianceAmount, varianceDirection, variancePct } from "./variance";

describe("variance maths", () => {
  it("is actual minus comparison", () => {
    expect(varianceAmount(120, 100)).toBe(20);
    expect(varianceAmount(80, 100)).toBe(-20);
    expect(varianceAmount(0.1 + 0.2, 0.3)).toBe(0); // no floating-point noise
  });

  it("percentage uses the comparison's magnitude and is null for a zero comparison", () => {
    expect(variancePct(120, 100)).toBeCloseTo(20);
    expect(variancePct(-50, -100)).toBeCloseTo(50); // loss narrowed from -100 to -50: +50%
    expect(variancePct(10, 0)).toBeNull();
  });

  it("direction depends on whether the line is income or cost", () => {
    expect(varianceDirection("income", 10)).toBe("favorable");
    expect(varianceDirection("income", -10)).toBe("unfavorable");
    expect(varianceDirection("cost", 10)).toBe("unfavorable");
    expect(varianceDirection("cost", -10)).toBe("favorable");
    expect(varianceDirection("cost", 0)).toBe("neutral");
  });
});

const src = (row: number) => ({ file: "pnl.xlsx", sheet: "Data", row, column: "Jun-26", columnLetter: "C", raw: 0 });
let row = 2;
const rec = (scenario: PnlScenario, account: string, treatment: PnlRecord["treatment"], amount: number, period = "2026-06"): PnlRecord => ({
  scenario,
  period,
  account,
  treatment,
  amount,
  currency: "USD",
  source: src(row++),
});

function input(pnl: PnlRecord[]): AnalysisInput {
  const d = (value: number) => ({ value, origin: { type: "user" as const, editedAt: "2026-07-01T00:00:00Z" } });
  const drivers = { revenueGrowthPct: d(0), grossMarginPct: d(70), opexGrowthPct: d(0), otherCashFlow: d(0) };
  return {
    settings: { companyName: "Test", currency: "USD", fyStartMonth: 1, reportingPeriod: "2026-06", priorBasis: "prior_year", forecastMonths: 3 },
    pnl,
    cash: [],
    mrr: [],
    drivers: { base: drivers, upside: drivers, downside: drivers },
    issues: [],
  };
}

describe("variance table", () => {
  const base = [
    rec("actual", "Subscriptions", "revenue", 1100),
    rec("actual", "Hosting", "cogs", 300),
    rec("actual", "Salaries", "opex", 500),
    rec("budget", "Subscriptions", "revenue", 1000),
    rec("budget", "Hosting", "cogs", 250),
    rec("budget", "Salaries", "opex", 550),
  ];

  it("computes line, category and total variances with traceable sources", () => {
    const a = runAnalysis(input(base));
    const t = a.variance.month.budget;
    const revenue = t.lines.find((l) => l.key === "cat:revenue")!;
    expect(revenue.actual.value).toBe(1100);
    expect(revenue.comparison.value).toBe(1000);
    expect(revenue.amount.value).toBe(100);
    expect(revenue.pct.value).toBeCloseTo(10);
    expect(revenue.direction).toBe("favorable");
    expect(revenue.actual.sources[0]).toMatchObject({ file: "pnl.xlsx", sheet: "Data", period: "2026-06" });

    const gp = t.lines.find((l) => l.key === "tot:gross_profit")!;
    expect(gp.actual.value).toBe(800);
    expect(gp.comparison.value).toBe(750);
    const op = t.lines.find((l) => l.key === "tot:operating_result")!;
    expect(op.actual.value).toBe(300);
    expect(op.comparison.value).toBe(200);
    expect(op.amount.value).toBe(100);
    expect(op.actual.verified).toBe(true);

    const hosting = t.lines.find((l) => l.key === "acct:Hosting")!;
    expect(hosting.amount.value).toBe(50);
    expect(hosting.direction).toBe("unfavorable");
  });

  it("marks totals unverified when a reported subtotal does not reconcile", () => {
    const a = runAnalysis(input([...base, rec("actual", "Total revenue", "subtotal:revenue", 1150)]));
    const revenue = a.variance.month.budget.lines.find((l) => l.key === "cat:revenue")!;
    expect(revenue.actual.verified).toBe(false);
    expect(revenue.actual.reasons.join(" ")).toMatch(/Fails reconciliation/);
    // The failure flows through to everything derived from it.
    expect(revenue.amount.verified).toBe(false);
    expect(a.variance.month.budget.lines.find((l) => l.key === "tot:gross_profit")!.actual.verified).toBe(false);
    expect(a.checks.find((c) => c.status === "fail")?.difference).toBe(-50);
  });

  it("passes the reconciliation when the reported subtotal matches", () => {
    const a = runAnalysis(input([...base, rec("actual", "Total revenue", "subtotal:revenue", 1100)]));
    expect(a.checks.filter((c) => c.status === "pass")).toHaveLength(1);
    expect(a.variance.month.budget.lines.find((l) => l.key === "cat:revenue")!.actual.verified).toBe(true);
  });

  it("never invents a comparison: a missing budget line is unverified, not zero", () => {
    const a = runAnalysis(input([...base, rec("actual", "Consulting", "revenue", 50)]));
    const consulting = a.variance.month.budget.lines.find((l) => l.key === "acct:Consulting")!;
    expect(consulting.comparison.value).toBeNull();
    expect(consulting.comparison.verified).toBe(false);
    expect(consulting.amount.verified).toBe(false);
  });

  it("builds year-to-date from the monthly figures", () => {
    const a = runAnalysis(input([...base, rec("actual", "Subscriptions", "revenue", 900, "2026-05"), rec("budget", "Subscriptions", "revenue", 950, "2026-05")]));
    const ytd = a.variance.ytd.budget.lines.find((l) => l.key === "acct:Subscriptions")!;
    // Jan–Apr have no data, so YTD cannot be verified; the months that exist still sum correctly.
    expect(ytd.actual.verified).toBe(false);
    expect(ytd.actual.inputs).toHaveLength(6);
  });
});
