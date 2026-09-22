"use client";

import { useState } from "react";
import { mrrCsv, periodSlug } from "@/lib/export/csv";
import { periodLabel } from "@/lib/periods";
import { MrrWaterfall } from "../charts";
import { FigureValue, KindLegend } from "../figure";
import { Button, Card, EmptyState, Pill, SectionTitle, download, inputClass } from "../ui";
import { useWorkspace } from "../workspace";

export function MrrStep() {
  const { analysis: a } = useWorkspace();
  const rp = a.settings.reportingPeriod;
  const [period, setPeriod] = useState(a.mrr.some((b) => b.period === rp) ? rp : (a.mrr.at(-1)?.period ?? rp));
  if (!a.mrr.length) return <EmptyState title="No MRR data mapped">Map a sheet with new, expansion, contraction and churned MRR by month.</EmptyState>;
  const bridge = a.mrr.find((b) => b.period === period) ?? a.mrr.at(-1)!;
  const check = (p: string) => a.checks.find((c) => c.id === `rec.mrr.${p}.ending`);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="MRR bridge"
        subtitle="Starting MRR + new + expansion − contraction − churn = ending MRR. Each month is reconciled against the reported ending MRR and the previous month's ending."
        actions={
          <>
            <select aria-label="Month" className={`${inputClass} w-auto`} value={bridge.period} onChange={(e) => setPeriod(e.target.value)}>
              {a.mrr.map((b) => (
                <option key={b.period} value={b.period}>
                  {periodLabel(b.period)}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => download(`mrr-bridge-${periodSlug(a)}.csv`, mrrCsv(a), "text/csv")}>
              Export CSV
            </Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Ending MRR", bridge.ending],
          ["Net new MRR", bridge.netNew],
          ["Gross retention (month)", bridge.grr],
          ["Net retention (month)", bridge.nrr],
          ["ARR run-rate", bridge.arr],
        ].map(([label, fig]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label as string}</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              <FigureValue figure={fig as typeof bridge.ending} />
            </p>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">{periodLabel(bridge.period)}</h3>
          {check(bridge.period) ? (
            check(bridge.period)!.status === "pass" ? <Pill tone="good">✓ Reconciles to reported ending MRR</Pill> : <Pill tone="bad">✕ {check(bridge.period)!.detail}</Pill>
          ) : (
            <Pill>No reported ending MRR to reconcile against</Pill>
          )}
        </div>
        <MrrWaterfall bridge={bridge} currency={a.settings.currency} />
      </Card>
      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <h3 className="font-display text-lg font-semibold text-ink">Monthly bridge</h3>
          <div className="mt-2">
            <KindLegend />
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-y border-cream-300 bg-cream-100 text-xs uppercase tracking-wide text-muted">
                {["Month", "Starting", "+ New", "+ Expansion", "− Contraction", "− Churn", "= Ending (bridge)", "Reported ending", "Check"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-semibold ${i === 0 ? "pl-5 text-left" : i === 8 ? "pr-5 text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.mrr.map((b) => {
                const c = check(b.period);
                return (
                  <tr key={b.period} className={`border-b border-cream-200 ${b.period === bridge.period ? "bg-orange-50/50" : ""}`}>
                    <td className="py-2 pr-3 pl-5 text-ink">{periodLabel(b.period)}</td>
                    {[b.starting, b.new, b.expansion, b.contraction, b.churn].map((f) => (
                      <td key={f.id} className="px-3 py-2 text-right">
                        <FigureValue figure={f} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold">
                      <FigureValue figure={b.ending} />
                    </td>
                    <td className="px-3 py-2 text-right">{b.reportedEnding ? <FigureValue figure={b.reportedEnding} /> : <span className="text-muted">—</span>}</td>
                    <td className="py-2 pr-5 pl-3">{c ? <Pill tone={c.status === "pass" ? "good" : "bad"}>{c.status === "pass" ? "✓" : "✕ Fails"}</Pill> : <span className="text-xs text-muted">n/a</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
