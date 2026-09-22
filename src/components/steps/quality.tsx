"use client";

import { useState } from "react";
import { checksCsv, issuesCsv, periodSlug } from "@/lib/export/csv";
import { formatMoney } from "@/lib/format";
import type { Severity } from "@/lib/model";
import { periodLabel } from "@/lib/periods";
import { Banner, Button, Card, EmptyState, Pill, SectionTitle, download } from "../ui";
import { useWorkspace } from "../workspace";

const SEVERITY_TONE = { error: "bad", warning: "warn", info: "neutral" } as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" | "good" }) {
  const color = tone === "bad" && value ? "text-bad" : tone === "warn" && value ? "text-warn" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="rounded-xl border border-cream-300 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`num mt-1 font-display text-3xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export function QualityStep() {
  const { analysis: a, project } = useWorkspace();
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const cur = project.settings.currency;
  if (!project.files.length) return <EmptyState title="No data to check yet">Import and map files first.</EmptyState>;

  const count = (s: Severity) => a.issues.filter((i) => i.severity === s).length;
  const issues = a.issues.filter((i) => severity === "all" || i.severity === severity).sort((x, y) => ["error", "warning", "info"].indexOf(x.severity) - ["error", "warning", "info"].indexOf(y.severity));
  const checks = [...a.checks].sort((x, y) => ["fail", "skipped", "pass"].indexOf(x.status) - ["fail", "skipped", "pass"].indexOf(y.status));

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Data-quality report"
        subtitle="Required fields, duplicates, missing values, periods and currencies are validated, and totals are reconciled before any narrative is written."
        actions={
          <>
            <Button variant="secondary" onClick={() => download(`data-quality-${periodSlug(a)}.csv`, issuesCsv(a), "text/csv")}>
              Issues CSV
            </Button>
            <Button variant="secondary" onClick={() => download(`reconciliation-${periodSlug(a)}.csv`, checksCsv(a), "text/csv")}>
              Reconciliation CSV
            </Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Errors" value={count("error")} tone="bad" />
        <Stat label="Warnings" value={count("warning")} tone="warn" />
        <Stat label="Notes" value={count("info")} />
        <Stat label="Checks passed" value={a.summary.checksPassed} tone="good" />
        <Stat label="Checks failed" value={a.summary.checksFailed} tone="bad" />
        <Stat label="Unverified figures" value={a.summary.unverified} tone="warn" />
      </div>
      {count("error") === 0 && a.summary.checksFailed === 0 ? (
        <Banner tone="good" title="No blocking issues">All reconciliation checks pass. Warnings below are worth reading before you report.</Banner>
      ) : (
        <Banner tone="warn" title="Some figures are unverified">
          Figures touched by an error or a failed check are marked UNVERIFIED everywhere, and are excluded from the investor update and board pack. Fix the source file and re-import, or correct the mapping.
        </Banner>
      )}

      <Card className="p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Reconciliation checks</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold">Check</th>
                <th className="py-2 pr-3 text-right font-semibold">Expected</th>
                <th className="py-2 pr-3 text-right font-semibold">Actual</th>
                <th className="py-2 pr-3 text-right font-semibold">Difference</th>
                <th className="py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className="border-b border-cream-200 align-top">
                  <td className="py-2 pr-3">
                    <Pill tone={c.status === "pass" ? "good" : c.status === "fail" ? "bad" : "neutral"}>{c.status === "pass" ? "✓ Pass" : c.status === "fail" ? "✕ Fail" : "Skipped"}</Pill>
                  </td>
                  <td className="py-2 pr-3 text-ink">{c.label}</td>
                  <td className="num py-2 pr-3 text-right text-ink-soft">{c.expected === null ? "—" : formatMoney(c.expected, cur)}</td>
                  <td className="num py-2 pr-3 text-right text-ink-soft">{c.actual === null ? "—" : formatMoney(c.actual, cur)}</td>
                  <td className={`num py-2 pr-3 text-right ${c.status === "fail" ? "font-semibold text-bad" : "text-muted"}`}>{c.difference === null ? "—" : formatMoney(c.difference, cur)}</td>
                  <td className="py-2 text-xs text-muted">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">Issues</h3>
          <div className="inline-flex rounded-xl bg-cream-200 p-1 text-sm" role="tablist">
            {(["all", "error", "warning", "info"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={severity === s} onClick={() => setSeverity(s)} className={`rounded-lg px-3 py-1 capitalize ${severity === s ? "bg-white font-medium text-ink shadow-sm" : "text-muted"}`}>
                {s === "all" ? `All (${a.issues.length})` : `${s}s (${count(s)})`}
              </button>
            ))}
          </div>
        </div>
        {issues.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No issues in this category.</p>
        ) : (
          <ul className="mt-4 divide-y divide-cream-200">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:gap-4">
                <span className="w-20 shrink-0">
                  <Pill tone={SEVERITY_TONE[i.severity]}>{i.severity}</Pill>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{i.message}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[i.file, i.sheet, i.row ? `row ${i.row}` : null, i.column ? `column ${i.column}` : null, i.period ? periodLabel(i.period) : null, i.account].filter(Boolean).join(" › ") || i.dataset}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
