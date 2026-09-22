"use client";

import { useState } from "react";
import { FORECAST_LABELS } from "@/lib/fields";
import { FORECAST_SCENARIOS } from "@/lib/model";
import { toSegments, type NarrativeDoc, type NarrativeKind } from "@/lib/narrative/tokens";
import { periodLabel } from "@/lib/periods";
import { FigureValue, KindLegend, Unverified, useFigures } from "../figure";
import { Banner, Button, Card, Pill, SectionTitle, Spinner, inputClass } from "../ui";
import { useWorkspace } from "../workspace";

function Rich({ text }: { text: string }) {
  const { figures, currency } = useFigures();
  return (
    <>
      {toSegments(text, figures, currency).map((s, i) =>
        s.t === "text" ? (
          <span key={i}>{s.text}</span>
        ) : s.t === "fig" ? (
          s.known ? (
            <FigureValue key={i} figure={figures[s.id]} compact={figures[s.id].unit === "currency" && Math.abs(figures[s.id].value ?? 0) >= 100_000} className="font-semibold" />
          ) : (
            <span key={i} className="rounded bg-bad-bg px-1 text-bad">
              [unknown figure]
            </span>
          )
        ) : (
          <span key={i} className="rounded bg-bad-bg px-0.5 text-bad" title="This number was written by the model, not taken from a verified calculation.">
            {s.text}
            <Unverified />
          </span>
        ),
      )}
    </>
  );
}

function KpiTable() {
  const { analysis: a } = useWorkspace();
  return (
    <table className="my-3 w-full text-sm">
      <tbody>
        {a.kpis.map((id) => (
          <tr key={id} className="border-b border-cream-200">
            <td className="py-1.5 pr-3 text-ink-soft">{a.figures[id].label}</td>
            <td className="py-1.5 text-right">
              <FigureValue figure={a.figures[id]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VarianceSummary() {
  const { analysis: a } = useWorkspace();
  const lines = a.variance.month.budget.lines.filter((l) => l.level !== "account");
  return (
    <table className="my-3 w-full text-sm">
      <thead>
        <tr className="border-b border-cream-300 text-xs uppercase tracking-wide text-muted">
          <th className="py-1.5 text-left font-semibold">{periodLabel(a.settings.reportingPeriod)}</th>
          <th className="py-1.5 text-right font-semibold">Actual</th>
          <th className="py-1.5 text-right font-semibold">Budget</th>
          <th className="py-1.5 text-right font-semibold">Variance</th>
          <th className="py-1.5 text-right font-semibold">%</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.key} className="border-b border-cream-200">
            <td className="py-1.5 pr-3 text-ink">{l.label}</td>
            <td className="py-1.5 text-right">
              <FigureValue figure={l.actual} compact />
            </td>
            <td className="py-1.5 text-right">
              <FigureValue figure={l.comparison} compact />
            </td>
            <td className="py-1.5 text-right">
              <FigureValue figure={l.amount} compact signed direction={l.direction} />
            </td>
            <td className="py-1.5 text-right">
              <FigureValue figure={l.pct} signed direction={l.direction} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OutlookTable() {
  const { analysis: a } = useWorkspace();
  return (
    <table className="my-3 w-full text-sm">
      <thead>
        <tr className="border-b border-cream-300 text-xs uppercase tracking-wide text-muted">
          <th className="py-1.5 text-left font-semibold">Scenario (forecast)</th>
          <th className="py-1.5 text-right font-semibold">Revenue, {periodLabel(a.forecast.base.months.at(-1)?.period ?? "")}</th>
          <th className="py-1.5 text-right font-semibold">Closing cash</th>
          <th className="py-1.5 text-right font-semibold">Runway</th>
        </tr>
      </thead>
      <tbody>
        {FORECAST_SCENARIOS.map((s) => {
          const last = a.forecast[s].months.at(-1);
          return (
            <tr key={s} className="border-b border-cream-200">
              <td className="py-1.5 text-ink">{FORECAST_LABELS[s]}</td>
              <td className="py-1.5 text-right">
                <FigureValue figure={last?.revenue} compact />
              </td>
              <td className="py-1.5 text-right">
                <FigureValue figure={last?.closingCash} compact />
              </td>
              <td className="py-1.5 text-right">
                <FigureValue figure={a.runway[s].runway} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const TITLES: Record<NarrativeKind, { title: string; blurb: string }> = {
  investor_update: { title: "Investor update", blurb: "A short monthly update for existing investors." },
  board_pack: { title: "Board pack: finance section", blurb: "KPIs, variances, outlook, risks and proposed actions for the board." },
};

function NarrativePanel({ kind }: { kind: NarrativeKind }) {
  const { project, update, input, analysisKey } = useWorkspace();
  const doc = project.narratives[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stale = doc && doc.basis !== analysisKey;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/narrative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, commentary: project.commentary, input }) });
      const json = (await res.json().catch(() => ({}))) as NarrativeDoc & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `The server returned ${res.status}`);
      update((p) => ({ ...p, narratives: { ...p.narratives, [kind]: json }, review: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft the narrative.");
    } finally {
      setBusy(false);
    }
  };

  const extras: Record<string, React.ReactNode> = kind === "board_pack" ? { KPIs: <KpiTable />, "Variance commentary": <VarianceSummary />, Outlook: <OutlookTable /> } : {};

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold text-ink">{TITLES[kind].title}</h3>
          <p className="text-sm text-muted">{TITLES[kind].blurb}</p>
        </div>
        <div className="flex items-center gap-2">
          {doc && <Pill tone="warn">Draft · needs review</Pill>}
          <Button onClick={generate} disabled={busy} variant={doc ? "secondary" : "primary"}>
            {busy ? (
              <>
                <Spinner /> Drafting…
              </>
            ) : doc ? (
              "Redraft"
            ) : (
              "Draft with AI"
            )}
          </Button>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Banner tone="bad" title="Drafting failed">
            {error}
          </Banner>
        </div>
      )}
      {busy && !doc && <p className="mt-6 text-sm text-muted">Writing from the verified figures. This takes about 30–60 seconds.</p>}
      {stale && (
        <div className="mt-4">
          <Banner tone="warn" title="The figures changed after this draft was written" action={<Button variant="secondary" onClick={generate} disabled={busy}>Redraft</Button>}>
            Redraft so the text matches the current analysis. Figure values shown below are always current.
          </Banner>
        </div>
      )}
      {doc && (
        <article className="mt-5 space-y-5">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-orange-700">{s.heading}</h4>
              {extras[s.heading]}
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mt-2 leading-relaxed text-ink-soft">
                  <Rich text={p} />
                </p>
              ))}
              {s.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-ink-soft marker:text-orange-400">
                  {s.bullets.map((b, i) => (
                    <li key={i}>
                      <Rich text={b} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {doc.flags.length > 0 ? (
            <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-4">
              <p className="text-sm font-semibold text-warn">Review before use ({doc.flags.length})</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                {doc.flags.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium">{f.section}:</span> {f.message}
                    {f.reason === "causal_claim" && <span className="block text-xs text-muted">“{f.text}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-good">✓ Every number in this draft comes from a verified figure, and no causal claims were detected.</p>
          )}
          <p className="text-xs text-muted">
            Drafted by {doc.model} on {new Date(doc.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Figures are inserted by the app from the verified calculations; click any figure to trace it.
          </p>
        </article>
      )}
    </Card>
  );
}

export function ReportsStep() {
  const { project, update, analysis: a } = useWorkspace();
  const verifiedKpis = a.kpis.filter((id) => a.figures[id].verified).length;
  return (
    <div className="space-y-5">
      <SectionTitle title="Investor update & board pack" subtitle="Drafted by AI from verified figures only. The AI never calculates: it can only reference figures by ID, and the app inserts the values." />
      <Banner tone={a.summary.checksFailed ? "warn" : "good"} title={`Reconciled: ${a.summary.checksPassed} checks passed, ${a.summary.checksFailed} failed`}>
        {verifiedKpis} of {a.kpis.length} headline KPIs are verified. {a.summary.unverified} unverified figures are excluded from drafting.
      </Banner>
      <Card className="p-5">
        <label htmlFor="commentary" className="font-display text-lg font-semibold text-ink">
          Management commentary
        </label>
        <p className="mt-1 mb-3 text-sm text-muted">The only source the AI may use for reasons behind the numbers. Leave it empty and the drafts will say drivers are to be confirmed.</p>
        <textarea
          id="commentary"
          className={`${inputClass} min-h-28`}
          value={project.commentary}
          onChange={(e) => update((p) => ({ ...p, commentary: e.target.value, review: null }))}
          placeholder="e.g. Services revenue was below plan because two implementation projects slipped to July."
          maxLength={10_000}
        />
      </Card>
      <KindLegend />
      <NarrativePanel kind="investor_update" />
      <NarrativePanel kind="board_pack" />
    </div>
  );
}
