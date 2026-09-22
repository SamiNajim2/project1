"use client";

import { useMemo, useState } from "react";
import { assumptionsCsv, CSV_EXPORTS, periodSlug } from "@/lib/export/csv";
import { reportMarkdown } from "@/lib/export/markdown";
import { DRIVER_DEFS, FORECAST_LABELS } from "@/lib/fields";
import { FORECAST_SCENARIOS, type DriverKey, type FigureKind } from "@/lib/model";
import { FigureValue } from "../figure";
import { Banner, Button, Card, Pill, SectionTitle, download, inputClass } from "../ui";
import { useWorkspace } from "../workspace";

const CHECKLIST = [
  "I reviewed the data-quality report and the reconciliation checks.",
  "I reviewed every UNVERIFIED figure and understand why it is unverified.",
  "I reviewed the forecast assumptions for all three scenarios.",
  "I read the investor update and board pack drafts, including every review flag.",
];

export function RegisterStep() {
  const { project, update, analysis: a, input, reviewKey } = useWorkspace();
  const [name, setName] = useState(project.review?.reviewer ?? "");
  const [ticks, setTicks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unverified" | FigureKind>("all");
  const [limit, setLimit] = useState(150);

  const review = project.review;
  const reviewed = !!review && review.fingerprint === reviewKey;
  const changedSinceReview = !!review && review.fingerprint !== reviewKey;
  const slug = `${(project.settings.companyName || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${periodSlug(a)}`;

  const figures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(a.figures)
      .filter((f) => (filter === "all" ? true : filter === "unverified" ? !f.verified : f.kind === filter))
      .filter((f) => !q || f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))
      .sort((x, y) => Number(x.verified) - Number(y.verified));
  }, [a.figures, query, filter]);

  const signOff = () =>
    update((p) => ({ ...p, review: { reviewer: name.trim(), reviewedAt: new Date().toISOString(), fingerprint: reviewKey } }));

  return (
    <div className="space-y-5">
      <SectionTitle title="Verification register & export" subtitle="Every calculated figure with its formula, sources and status, plus the assumptions behind the forecast. Exports unlock after a person signs off." />

      <Card className="p-6">
        <h3 className="font-display text-xl font-semibold text-ink">Human review</h3>
        {reviewed ? (
          <div className="mt-3">
            <Banner tone="good" title={`Reviewed by ${review!.reviewer}`}>
              {new Date(review!.reviewedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}. Any change to the data, assumptions or drafts will require a new review.
            </Banner>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {changedSinceReview && <Banner tone="warn" title="Something changed since the last review">The previous sign-off by {review!.reviewer} no longer applies. Review again to export.</Banner>}
            {!project.narratives.investor_update || !project.narratives.board_pack ? (
              <Banner tone="info" title="Drafts missing">The investor update and board pack have not both been drafted. You can still sign off and export the analysis; the report will say which drafts are missing.</Banner>
            ) : null}
            <ul className="space-y-2">
              {CHECKLIST.map((item, i) => (
                <li key={item}>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
                    <input type="checkbox" className="mt-0.5 accent-orange-600" checked={ticks[i]} onChange={(e) => setTicks((t) => t.map((v, j) => (j === i ? e.target.checked : v)))} />
                    {item}
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium text-ink">
                Reviewer name
                <input className={`${inputClass} mt-1 w-64`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </label>
              <Button onClick={signOff} disabled={!name.trim() || ticks.some((t) => !t)}>
                Sign off review
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink">Export</h3>
            <p className="text-sm text-muted">{reviewed ? "Download the report and analysis tables." : "Available after sign-off."}</p>
          </div>
          {!reviewed && <Pill tone="warn">Locked until reviewed</Pill>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={!reviewed}
            onClick={() => download(`${slug}-finance-report.md`, reportMarkdown(a, { drivers: input.drivers, narratives: project.narratives, review: project.review!, commentary: project.commentary }), "text/markdown")}
          >
            Full report (Markdown)
          </Button>
          {CSV_EXPORTS.map((e) => (
            <Button key={e.id} variant="secondary" disabled={!reviewed} onClick={() => download(`${slug}-${e.file}`, e.build(a), "text/csv")}>
              {e.label} (CSV)
            </Button>
          ))}
          <Button variant="secondary" disabled={!reviewed} onClick={() => download(`${slug}-assumptions.csv`, assumptionsCsv(input.drivers), "text/csv")}>
            Assumptions register (CSV)
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <h3 className="font-display text-lg font-semibold text-ink">Assumptions register</h3>
          <p className="text-sm text-muted">Forecast inputs, kept separate from actuals. Defaults remain unverified until confirmed.</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-y border-cream-300 bg-cream-100 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-semibold">Assumption</th>
                {FORECAST_SCENARIOS.map((s) => (
                  <th key={s} className="px-3 py-2 text-right font-semibold">
                    {FORECAST_LABELS[s]}
                  </th>
                ))}
                <th className="px-5 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(DRIVER_DEFS) as DriverKey[]).map((k) => {
                const o = input.drivers.base[k].origin;
                return (
                  <tr key={k} className="border-b border-cream-200">
                    <td className="px-5 py-2 text-ink">{DRIVER_DEFS[k].label}</td>
                    {FORECAST_SCENARIOS.map((s) => (
                      <td key={s} className="px-3 py-2 text-right">
                        <FigureValue figure={a.forecast[s].assumptions[k]} />
                      </td>
                    ))}
                    <td className="px-5 py-2 text-xs text-muted">{o.type === "file" ? `${o.source.file} › ${o.source.sheet} › row ${o.source.row}` : o.type === "user" ? "Entered by a user" : `Default: ${o.basis}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">Verification register</h3>
            <p className="text-sm text-muted">
              {a.summary.figures} figures: {a.summary.verified} verified, {a.summary.unverified} unverified.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input className={`${inputClass} w-56`} placeholder="Search figures" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search figures" />
            <select className={`${inputClass} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
              <option value="all">All figures</option>
              <option value="unverified">Unverified only</option>
              <option value="actual">Actuals</option>
              <option value="budget">Budget</option>
              <option value="prior">Prior period</option>
              <option value="derived">Calculated</option>
              <option value="forecast">Forecast</option>
              <option value="assumption">Assumptions</option>
            </select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-y border-cream-300 bg-cream-100 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-semibold">Figure</th>
                <th className="px-3 py-2 text-right font-semibold">Value</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Formula</th>
                <th className="px-5 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {figures.slice(0, limit).map((f) => (
                <tr key={f.id} className="border-b border-cream-200 align-top">
                  <td className="px-5 py-2 text-ink">{f.label}</td>
                  <td className="px-3 py-2 text-right">
                    <FigureValue figure={f} />
                  </td>
                  <td className="px-3 py-2">{f.verified ? <Pill tone="good">Verified</Pill> : <Pill tone="bad">Unverified</Pill>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">{f.formula}</td>
                  <td className="px-5 py-2 text-xs text-muted">
                    {f.sources.length
                      ? f.sources.slice(0, 2).map((s, i) => (
                          <span key={i} className="block">
                            {s.file} › {s.sheet} › {s.column} › row{s.rows.length > 1 ? "s" : ""} {s.rows.join(", ")}
                          </span>
                        ))
                      : f.inputs.length
                        ? `From ${f.inputs.length} figure${f.inputs.length > 1 ? "s" : ""}`
                        : "No source"}
                    {!f.verified && <span className="mt-1 block text-bad">{f.reasons[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {figures.length > limit && (
          <div className="px-5 py-3">
            <Button variant="ghost" onClick={() => setLimit((l) => l + 300)}>
              Show more ({figures.length - limit} remaining)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
