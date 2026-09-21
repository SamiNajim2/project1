"use client";

import { useState, type ReactNode } from "react";
import { outlineToMarkdown } from "@/lib/markdown";
import { effectiveRecommendation, type CitationIndex } from "@/lib/report";
import type { Source } from "@/lib/schemas";
import { STAGES, type Project, type StageId } from "@/lib/types";
import { BasisBadge, Citations, ClaimList, ClaimText, EvidenceGaps } from "./citations";
import { RecommendationEditor } from "./recommendation-editor";
import { Button, Card, Pill, Skeleton, Spinner } from "./ui";

export const REPORT_SECTIONS: { id: string; title: string; stage: StageId }[] = [
  { id: "executive-summary", title: "Executive summary", stage: "summary" },
  { id: "market", title: "Market overview", stage: "market" },
  { id: "competitors", title: "Competitor comparison", stage: "market" },
  { id: "segments", title: "Customer segments", stage: "market" },
  { id: "options", title: "Strategic options", stage: "strategy" },
  { id: "recommendation", title: "Recommendation", stage: "strategy" },
  { id: "business-case", title: "Business case", stage: "business" },
  { id: "plan", title: "90-day plan", stage: "business" },
  { id: "outline", title: "Presentation outline", stage: "summary" },
  { id: "sources", title: "Sources", stage: "research" },
];

function Section({
  id,
  number,
  title,
  stage,
  project,
  runningStage,
  actions,
  children,
}: {
  id: string;
  number: number;
  title: string;
  stage: StageId;
  project: Project;
  runningStage: StageId | null;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const ready = !!project.outputs[stage];
  const status = runningStage === stage ? "running" : project.stages[stage]?.status;
  const stageLabel = STAGES.find((s) => s.id === stage)?.label ?? stage;
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-sm font-semibold text-orange-600 tabular-nums">{String(number).padStart(2, "0")}</span>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          </div>
          {ready && actions}
        </div>
        {ready ? (
          children
        ) : status === "running" ? (
          <div className="space-y-3" aria-busy="true">
            <p className="flex items-center gap-2 text-sm text-orange-700">
              <Spinner /> Generating with the {stageLabel.toLowerCase()} step…
            </p>
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : status === "error" ? (
          <p className="text-sm text-rose-700">The {stageLabel.toLowerCase()} step did not finish. Retry it from the pipeline panel.</p>
        ) : (
          <p className="text-sm text-muted">Appears after the “{stageLabel}” step.</p>
        )}
      </Card>
    </section>
  );
}

export function Report({
  project,
  index,
  runningStage,
  onRebuildDownstream,
}: {
  project: Project;
  index: CitationIndex;
  runningStage: StageId | null;
  onRebuildDownstream: () => void;
}) {
  const { market, strategy, business, summary, research } = project.outputs;
  const rec = effectiveRecommendation(project);
  const common = { project, runningStage };
  let n = 0;

  return (
    <div className="space-y-6">
      {project.downstreamStale && (business || summary) && (
        <div className="no-print flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink-soft">
            You edited the recommendation. The business case, 90-day plan, executive summary and outline still reflect the previous recommendation.
          </p>
          <Button onClick={onRebuildDownstream} disabled={!!runningStage}>
            Update them
          </Button>
        </div>
      )}

      <Section id="executive-summary" number={++n} title="Executive summary" stage="summary" {...common}>
        {summary && (
          <div className="space-y-5">
            <p className="font-display text-xl leading-snug text-ink">{summary.executiveSummary.headline}</p>
            <ClaimList claims={summary.executiveSummary.situation} />
            <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                Recommendation{rec?.edited ? " · edited by you" : ""}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink">
                {rec?.edited && project.downstreamStale ? `${rec.headline} ${rec.rationaleText ?? ""}` : summary.executiveSummary.recommendation}
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Next steps</p>
              <ol className="space-y-1.5">
                {summary.executiveSummary.nextSteps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-ink-soft">
                    <span className="font-display font-semibold text-orange-600 tabular-nums">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Section>

      <Section id="market" number={++n} title="Market overview" stage="market" {...common}>
        {market && (
          <>
            <ClaimList claims={market.marketOverview.summary} />
            {market.marketOverview.keyMetrics.length > 0 && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {market.marketOverview.keyMetrics.map((m, i) => (
                  <div key={i} className="rounded-xl border border-cream-300 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">{m.label}</p>
                    <p className="mt-1.5 text-[15px] font-medium leading-snug text-ink">
                      <ClaimText claim={m.value} />
                    </p>
                  </div>
                ))}
              </div>
            )}
            <h3 className="mt-7 mb-3 text-sm font-semibold text-ink">Trends</h3>
            <ClaimList claims={market.marketOverview.trends} />
            <EvidenceGaps gaps={market.marketOverview.evidenceGaps} />
          </>
        )}
      </Section>

      <Section id="competitors" number={++n} title="Competitor comparison" stage="market" {...common}>
        {market && <CompetitorTable project={project} />}
      </Section>

      <Section id="segments" number={++n} title="Customer segments" stage="market" {...common}>
        {market && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {market.segments.items.map((s, i) => (
                <div key={i} className="rounded-xl border border-cream-300 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-lg font-semibold text-ink">{s.name}</h3>
                    <Pill tone={s.attractiveness === "high" ? "orange" : s.attractiveness === "medium" ? "neutral" : "red"}>
                      {s.attractiveness} attractiveness
                    </Pill>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    <ClaimText claim={s.description} />
                  </p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Needs</dt>
                      <dd className="mt-1">
                        <ul className="space-y-1 text-ink-soft">
                          {s.needs.map((need, j) => (
                            <li key={j}>
                              <ClaimText claim={need} />
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Size</dt>
                      <dd className="mt-1 text-ink-soft">
                        <ClaimText claim={s.sizeIndicator} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Why it matters</dt>
                      <dd className="mt-1 text-ink-soft">
                        <ClaimText claim={s.rationale} />
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <EvidenceGaps gaps={market.segments.evidenceGaps} />
          </>
        )}
      </Section>

      <Section id="options" number={++n} title="Strategic options" stage="strategy" {...common}>
        {strategy && (
          <div className="grid gap-4 lg:grid-cols-3">
            {strategy.options.map((o) => {
              const chosen = rec?.optionId === o.id;
              return (
                <div
                  key={o.id}
                  className={`flex flex-col rounded-xl border bg-white p-5 ${chosen ? "border-orange-500 ring-4 ring-orange-100" : "border-cream-300"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-cream-200 font-display font-semibold text-ink">{o.id}</span>
                    {chosen && <Pill tone="orange">Recommended</Pill>}
                  </div>
                  <h3 className="mt-3 font-display text-lg leading-snug font-semibold text-ink">{o.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{o.summary}</p>
                  <OptionList title="Benefits" claims={o.benefits} tone="text-sage-700" />
                  <OptionList title="Risks" claims={o.risks} tone="text-rose-700" />
                  <OptionList title="Requirements" claims={o.requirements} tone="text-ink" />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section id="recommendation" number={++n} title="Recommendation" stage="strategy" {...common}>
        {strategy && <RecommendationEditor project={project} disabled={!!runningStage} />}
      </Section>

      <Section id="business-case" number={++n} title="Business case" stage="business" {...common}>
        {business && <BusinessCase project={project} />}
      </Section>

      <Section id="plan" number={++n} title="90-day plan" stage="business" {...common}>
        {business && <NinetyDayPlan project={project} />}
      </Section>

      <Section id="outline" number={++n} title="Presentation outline" stage="summary" {...common} actions={<CopyOutlineButton project={project} />}>
        {summary && <Outline project={project} />}
      </Section>

      <Section id="sources" number={++n} title="Sources" stage="research" {...common}>
        {research && <SourcesSection project={project} index={index} />}
      </Section>
    </div>
  );
}

function OptionList({ title, claims, tone }: { title: string; claims: Parameters<typeof ClaimList>[0]["claims"]; tone: string }) {
  return (
    <div className="mt-4">
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-ink-soft">
        {claims.map((c, i) => (
          <li key={i}>
            <ClaimText claim={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const COMPETITOR_COLUMNS = [
  ["positioning", "Positioning"],
  ["targetCustomers", "Target customers"],
  ["offering", "Offering"],
  ["pricing", "Pricing"],
  ["strengths", "Strengths"],
  ["weaknesses", "Weaknesses"],
] as const;

function CompetitorTable({ project }: { project: Project }) {
  const competitors = project.outputs.market!.competitors;
  return (
    <>
      <div className="-mx-5 overflow-x-auto sm:-mx-7">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-cream-300 bg-cream-100">
              <th scope="col" className="sticky left-0 z-10 w-44 bg-cream-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted sm:px-7">
                Company
              </th>
              {COMPETITOR_COLUMNS.map(([, label]) => (
                <th key={label} scope="col" className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {competitors.rows.map((row, i) => (
              <tr key={i} className={`border-b border-cream-200 align-top ${row.isSubject ? "bg-orange-50/50" : ""}`}>
                <th scope="row" className={`sticky left-0 z-10 px-5 py-4 font-semibold text-ink sm:px-7 ${row.isSubject ? "bg-orange-50" : "bg-cream-50"}`}>
                  {row.name}
                  {row.isSubject && <span className="mt-1 block text-xs font-medium text-orange-700">This company</span>}
                  {row.website && (
                    <a
                      href={row.website.startsWith("http") ? row.website : `https://${row.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs font-normal text-muted hover:text-orange-700"
                    >
                      {row.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  )}
                </th>
                {COMPETITOR_COLUMNS.map(([key]) => (
                  <td key={key} className="px-3 py-4 leading-relaxed text-ink-soft">
                    <ClaimText claim={row[key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-6 mb-3 text-sm font-semibold text-ink">Takeaways</h3>
      <ClaimList claims={competitors.takeaways} />
      <EvidenceGaps gaps={competitors.evidenceGaps} />
    </>
  );
}

function BusinessCase({ project }: { project: Project }) {
  const b = project.outputs.business!.businessCase;
  return (
    <div className="space-y-7">
      <p className="text-[15px] leading-relaxed text-ink-soft">{b.summary}</p>
      <div className="rounded-xl border border-amber-100 bg-amber-100/40 p-4 text-sm text-ink-soft">
        <strong className="text-amber-800">How to read this.</strong> Figures are in {b.currency}. Projections are estimates derived from the labeled
        assumptions below. Validate the assumptions before relying on the numbers.
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Assumptions</h3>
        <div className="-mx-5 overflow-x-auto sm:-mx-7">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-y border-cream-300 bg-cream-100 text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-semibold sm:px-7">ID</th>
                <th className="px-3 py-2.5 font-semibold">Assumption</th>
                <th className="px-3 py-2.5 font-semibold">Value</th>
                <th className="px-3 py-2.5 font-semibold">Basis</th>
                <th className="px-3 py-2.5 font-semibold">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {b.assumptions.map((a) => (
                <tr key={a.id} className="border-b border-cream-200 align-top">
                  <td className="px-5 py-3 font-mono text-xs text-muted sm:px-7">{a.id}</td>
                  <td className="px-3 py-3 font-medium text-ink">{a.label}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-ink tabular-nums">{a.value}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {a.basis === "sourced" ? <span className="text-xs font-medium text-sage-700">Sourced</span> : <BasisBadge basis={a.basis} />}
                    <Citations evidenceIds={a.evidenceIds} />
                  </td>
                  <td className="px-3 py-3 text-ink-soft">{a.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          Projections <BasisBadge basis="estimate" />
        </h3>
        <div className="-mx-5 overflow-x-auto sm:-mx-7">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-y border-cream-300 bg-cream-100 text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-semibold sm:px-7">Metric</th>
                <th className="px-3 py-2.5 font-semibold">Conservative</th>
                <th className="px-3 py-2.5 font-semibold text-orange-700">Base</th>
                <th className="px-3 py-2.5 font-semibold">Upside</th>
                <th className="px-3 py-2.5 font-semibold">Derivation</th>
              </tr>
            </thead>
            <tbody>
              {b.projections.map((p, i) => (
                <tr key={i} className="border-b border-cream-200 align-top">
                  <td className="px-5 py-3 font-medium text-ink sm:px-7">{p.metric}</td>
                  <td className="px-3 py-3 tabular-nums text-ink-soft">{p.conservative}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums text-ink">{p.base}</td>
                  <td className="px-3 py-3 tabular-nums text-ink-soft">{p.upside}</td>
                  <td className="px-3 py-3 text-xs leading-relaxed text-muted">{p.derivation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {b.investment.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Investment</h3>
          <ul className="divide-y divide-cream-200 rounded-xl border border-cream-300 bg-white">
            {b.investment.map((item, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink">{item.item}</span>
                <span className="flex items-baseline gap-3">
                  <span className="font-semibold tabular-nums text-ink">{item.amount}</span>
                  {item.assumptionIds.length > 0 && <span className="font-mono text-xs text-muted">{item.assumptionIds.join(", ")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Risks to the case</h3>
        <ClaimList claims={b.risksToCase} />
      </div>
      <EvidenceGaps gaps={b.evidenceGaps} />
    </div>
  );
}

function NinetyDayPlan({ project }: { project: Project }) {
  const plan = project.outputs.business!.ninetyDayPlan;
  return (
    <div className="space-y-7">
      <div className="grid gap-4 lg:grid-cols-3">
        {plan.phases.map((phase, i) => (
          <div key={i} className="rounded-xl border border-cream-300 bg-white p-5">
            <p className="font-display text-sm font-semibold text-orange-600">{phase.name}</p>
            <p className="mt-1 font-medium leading-snug text-ink">{phase.goal}</p>
            <ul className="mt-4 space-y-3">
              {phase.actions.map((a, j) => (
                <li key={j} className="border-l-2 border-cream-300 pl-3 text-sm">
                  <p className="text-ink">{a.action}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-medium text-ink-soft">{a.owner}</span> · {a.deliverable}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">KPIs</h3>
          <ul className="space-y-2 text-sm">
            {plan.kpis.map((k, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-cream-300">
                <span className="text-ink">{k.metric}</span>
                <span className="text-ink-soft">
                  {k.target}
                  {k.basis !== "sourced" && <BasisBadge basis={k.basis} />}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Decision points</h3>
          <ul className="space-y-2 text-sm text-ink-soft">
            {plan.decisionPoints.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-orange-600" aria-hidden="true">◆</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function CopyOutlineButton({ project }: { project: Project }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outlineToMarkdown(project));
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2200);
  };
  return (
    <Button variant="secondary" onClick={copy} className="no-print">
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy outline"}
    </Button>
  );
}

function Outline({ project }: { project: Project }) {
  const outline = project.outputs.summary!.presentationOutline;
  return (
    <div>
      <p className="mb-4 font-display text-lg text-ink">{outline.title}</p>
      <ol className="space-y-3">
        {outline.slides.map((slide, i) => (
          <li key={i} className="grid gap-3 rounded-xl border border-cream-300 bg-white p-4 sm:grid-cols-[3rem_1fr]">
            <span className="grid size-10 place-items-center rounded-lg bg-orange-50 font-display font-semibold text-orange-700 tabular-nums">{i + 1}</span>
            <div>
              <p className="font-semibold leading-snug text-ink">
                {slide.title}
                <Citations evidenceIds={slide.evidenceIds} />
              </p>
              <p className="mt-1 text-sm text-ink-soft">{slide.keyMessage}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-soft marker:text-orange-400">
                {slide.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                <span className="font-semibold">Visual:</span> {slide.visual}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function sourceHost(source: Source): string {
  if (!source.url) return source.kind === "pdf" ? "Uploaded PDF" : "Your notes";
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function SourcesSection({ project, index }: { project: Project; index: CitationIndex }) {
  const research = project.outputs.research!;
  const [tab, setTab] = useState<"sources" | "evidence">("sources");
  const cited = research.sources.filter((s) => s.cited);
  const consulted = research.sources.filter((s) => !s.cited);
  return (
    <div>
      <div className="no-print mb-5 inline-flex rounded-xl bg-cream-200 p-1 text-sm" role="tablist">
        {(["sources", "evidence"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${tab === t ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {t === "sources" ? `Cited sources (${cited.length})` : `Evidence (${research.evidence.length})`}
          </button>
        ))}
      </div>

      {tab === "sources" ? (
        <>
          <ol className="space-y-2">
            {cited.map((s) => (
              <li key={s.id} id={`source-${s.id}`} className="flex scroll-mt-24 gap-3 text-sm">
                <span className="w-6 shrink-0 text-right font-semibold text-orange-700 tabular-nums">{index.numbers.get(s.id)}</span>
                <div className="min-w-0">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-cream-400 underline-offset-2 hover:text-orange-700 hover:decoration-orange-500">
                      {s.title}
                    </a>
                  ) : (
                    <span className="font-medium text-ink">{s.title}</span>
                  )}
                  <p className="truncate text-xs text-muted">
                    {sourceHost(s)}
                    {s.pageAge ? ` · ${s.pageAge}` : ""}
                    {s.kind === "user_url" ? " · provided by you" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {consulted.length > 0 && (
            <details className="mt-6 rounded-xl border border-cream-300 bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-soft">Also consulted, not cited ({consulted.length})</summary>
              <ul className="mt-3 space-y-1.5 text-sm">
                {consulted.map((s) => (
                  <li key={s.id} className="truncate">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink-soft hover:text-orange-700 hover:underline">
                        {s.title}
                      </a>
                    ) : (
                      <span className="text-ink-soft">{s.title}</span>
                    )}
                    <span className="text-xs text-muted"> · {sourceHost(s)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {research.searches.length > 0 && (
            <p className="mt-5 text-xs text-muted">
              Searches run: {research.searches.map((q) => `“${q}”`).join(", ")}
            </p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {research.evidence.map((e) => (
            <div key={e.id} className="rounded-xl border border-cream-300 bg-white p-4 text-sm">
              <div className="flex items-start gap-3">
                <span className="font-mono text-xs text-muted">{e.id}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink">
                    {e.text}
                    <Citations evidenceIds={[e.id]} />
                  </p>
                  <p className="mt-1 text-xs text-muted">{e.topic}</p>
                  {e.quotes.slice(0, 2).map((q, i) => (
                    <blockquote key={i} className="mt-2 border-l-2 border-orange-200 pl-3 text-xs leading-relaxed text-ink-soft italic">
                      “{q.quote}”{q.location ? ` (${q.location})` : ""}
                    </blockquote>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <EvidenceGaps gaps={research.gaps} />
        </div>
      )}
    </div>
  );
}

export function ResearchPlanCard({ project }: { project: Project }) {
  const plan = project.outputs.plan;
  if (!plan) return null;
  return (
    <details className="group rounded-2xl border border-cream-300 bg-cream-50 p-5 shadow-card sm:p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="text-xs font-semibold uppercase tracking-wide text-orange-600">Research plan</span>
          <span className="mt-1 block font-medium text-ink">{plan.objective}</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Key questions</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft marker:text-orange-400">
            {plan.keyQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Workstreams</p>
          <ul className="space-y-2 text-sm">
            {plan.workstreams.map((w, i) => (
              <li key={i}>
                <span className="font-medium text-ink">{w.name}</span>
                <span className="text-ink-soft"> — {w.focus}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
