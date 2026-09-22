"use client";

import { useState } from "react";
import type { VarianceTable } from "@/lib/calc/variance";
import { periodSlug, varianceCsv } from "@/lib/export/csv";
import { periodLabel } from "@/lib/periods";
import { FigureValue, KindLegend } from "../figure";
import { Button, Card, EmptyState, SectionTitle, download } from "../ui";
import { useWorkspace } from "../workspace";

function Table({ t }: { t: VarianceTable }) {
  const cmp = t.basis === "budget" ? "Budget" : t.comparisonScenario === "actual" ? "Prior month" : "Prior year";
  const cmpPeriods = t.comparisonPeriods.length === 1 ? periodLabel(t.comparisonPeriods[0]) : `${periodLabel(t.comparisonPeriods[0])}–${periodLabel(t.comparisonPeriods.at(-1)!)}`;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h3 className="font-display text-lg font-semibold text-ink">{t.title}</h3>
        <p className="text-xs text-muted">
          Comparison: {cmp}, {cmpPeriods}
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-cream-300 bg-cream-100 text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2 text-left font-semibold">Line</th>
              <th className="px-3 py-2 text-right font-semibold">Actual</th>
              <th className="px-3 py-2 text-right font-semibold">{cmp}</th>
              <th className="px-3 py-2 text-right font-semibold">Variance</th>
              <th className="px-5 py-2 text-right font-semibold">Variance %</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map((l) => (
              <tr
                key={l.key}
                className={`border-b border-cream-200 ${l.level === "total" ? "bg-orange-50/60 font-semibold" : l.level === "category" ? "bg-cream-100/60 font-medium" : ""}`}
              >
                <td className={`px-5 py-2 text-ink ${l.level === "account" ? "pl-9 text-ink-soft" : ""}`}>{l.label}</td>
                <td className="px-3 py-2 text-right">
                  <FigureValue figure={l.actual} />
                </td>
                <td className="px-3 py-2 text-right">
                  <FigureValue figure={l.comparison} />
                </td>
                <td className="px-3 py-2 text-right">
                  <FigureValue figure={l.amount} signed direction={l.direction} />
                </td>
                <td className="px-5 py-2 text-right">
                  <FigureValue figure={l.pct} signed direction={l.direction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-muted">Green is favorable, red unfavorable: higher income or lower cost is favorable. Variance % = (Actual − Comparison) ÷ |Comparison|.</p>
    </Card>
  );
}

export function VarianceStep() {
  const { analysis: a, input } = useWorkspace();
  const [mode, setMode] = useState<"month" | "ytd">("month");
  if (!input.pnl.length) return <EmptyState title="No P&L data mapped">Map at least one actuals sheet to see variances.</EmptyState>;
  const tables = a.variance[mode];
  return (
    <div className="space-y-5">
      <SectionTitle
        title="Variance analysis"
        subtitle={`Actuals for ${periodLabel(a.settings.reportingPeriod)} against budget and the prior period. Totals are the sum of the lines; reported subtotals are only used to reconcile.`}
        actions={
          <>
            <div className="inline-flex rounded-xl bg-cream-200 p-1 text-sm" role="tablist">
              {(["month", "ytd"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1 ${mode === m ? "bg-white font-medium text-ink shadow-sm" : "text-muted"}`}>
                  {m === "month" ? "Month" : "Year to date"}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => download(`variance-${periodSlug(a)}.csv`, varianceCsv(a), "text/csv")}>
              Export CSV
            </Button>
          </>
        }
      />
      <KindLegend />
      <Table t={tables.budget} />
      <Table t={tables.prior} />
    </div>
  );
}
