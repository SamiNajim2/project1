"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { formatFigure } from "@/lib/format";
import type { Figure, FigureKind } from "@/lib/model";
import { periodLabel } from "@/lib/periods";
import { Pill } from "./ui";

interface FigureCtx {
  figures: Record<string, Figure>;
  currency: string;
  open: (id: string) => void;
}

const Ctx = createContext<FigureCtx | null>(null);

export function FigureProvider({ figures, currency, children }: { figures: Record<string, Figure>; currency: string; children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const open = (id: string) => setStack((s) => (s.at(-1) === id ? s : [...s, id]));
  return (
    <Ctx.Provider value={{ figures, currency, open }}>
      {children}
      {stack.length > 0 && <TraceDrawer stack={stack} setStack={setStack} figures={figures} currency={currency} />}
    </Ctx.Provider>
  );
}

export function useFigures() {
  const c = useContext(Ctx);
  if (!c) throw new Error("FigureProvider missing");
  return c;
}

const KIND_CLASS: Record<FigureKind, string> = {
  actual: "text-ink",
  derived: "text-ink",
  budget: "text-ink-soft",
  prior: "text-ink-soft",
  forecast: "italic text-forecast",
  assumption: "text-assumption",
};

export function Unverified({ compact = false }: { compact?: boolean }) {
  return (
    <span className="ml-1 inline-flex items-center rounded bg-bad-bg px-1 py-px align-middle text-[9.5px] font-bold tracking-wide text-bad not-italic">
      {compact ? "UNVERIF." : "UNVERIFIED"}
    </span>
  );
}

/** A calculated number. Click it to see its formula, inputs and source cells. */
export function FigureValue({ figure, signed = false, compact = false, className = "", direction }: { figure: Figure | undefined; signed?: boolean; compact?: boolean; className?: string; direction?: "favorable" | "unfavorable" | "neutral" | null }) {
  const { currency, open } = useFigures();
  if (!figure) return <span className="text-muted">—</span>;
  const tone = direction === "favorable" ? "text-good" : direction === "unfavorable" ? "text-bad" : KIND_CLASS[figure.kind];
  return (
    <button
      type="button"
      onClick={() => open(figure.id)}
      title={`${figure.label}\n${figure.formula}${figure.verified ? "" : `\nUNVERIFIED: ${figure.reasons[0] ?? ""}`}`}
      className={`num rounded px-0.5 text-right underline decoration-dotted decoration-cream-400 underline-offset-4 hover:bg-orange-50 hover:decoration-orange-500 ${tone} ${className}`}
    >
      {formatFigure(figure, currency, { signed, compact })}
      {!figure.verified && <Unverified />}
    </button>
  );
}

export function KindLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      <span className="font-medium text-ink-soft">Key:</span>
      <span className="text-ink">Actual</span>
      <span className="text-ink-soft">Budget / prior</span>
      <span className="text-forecast italic">Forecast</span>
      <span className="text-assumption">Assumption</span>
      <span>
        123
        <Unverified />
      </span>
      <span>Click any number to trace it.</span>
    </div>
  );
}

const KIND_LABEL: Record<FigureKind, { label: string; tone: "neutral" | "forecast" | "assumption" | "orange" }> = {
  actual: { label: "Actual", tone: "neutral" },
  budget: { label: "Budget", tone: "neutral" },
  prior: { label: "Prior period", tone: "neutral" },
  derived: { label: "Calculated", tone: "orange" },
  forecast: { label: "Forecast", tone: "forecast" },
  assumption: { label: "Assumption", tone: "assumption" },
};

function TraceDrawer({ stack, setStack, figures, currency }: { stack: string[]; setStack: (s: string[]) => void; figures: Record<string, Figure>; currency: string }) {
  const f = figures[stack.at(-1)!];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStack([]);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setStack]);
  if (!f) return null;
  const kind = KIND_LABEL[f.kind];
  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/10" onClick={() => setStack([])} aria-hidden="true" />
      <aside role="dialog" aria-label="Figure trace" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-cream-300 bg-cream-50 shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-cream-300 px-5 py-3">
          <div className="flex items-center gap-2">
            {stack.length > 1 && (
              <button onClick={() => setStack(stack.slice(0, -1))} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-cream-200">
                ← Back
              </button>
            )}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Figure trace</span>
          </div>
          <button onClick={() => setStack([])} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-cream-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={kind.tone}>{kind.label}</Pill>
              {f.verified ? <Pill tone="good">✓ Verified</Pill> : <Pill tone="bad">UNVERIFIED</Pill>}
            </div>
            <h3 className="mt-3 font-medium leading-snug text-ink">{f.label}</h3>
            <p className="num mt-1 font-display text-3xl font-semibold text-ink">{formatFigure(f, currency)}</p>
          </div>
          {!f.verified && (
            <div className="rounded-xl border border-bad-bg bg-bad-bg/50 p-3 text-sm">
              <p className="font-semibold text-bad">Why it is unverified</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
                {f.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Formula</p>
            <p className="mt-1 rounded-lg bg-cream-100 px-3 py-2 font-mono text-[13px] text-ink">{f.formula}</p>
          </div>
          {f.inputs.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Calculated from</p>
              <ul className="mt-2 divide-y divide-cream-200 rounded-xl border border-cream-300 bg-white">
                {f.inputs.map((id) => {
                  const inp = figures[id];
                  return (
                    <li key={id}>
                      <button onClick={() => setStack([...stack, id])} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-orange-50">
                        <span className="min-w-0 text-ink-soft">{inp?.label ?? id}</span>
                        <span className={`num shrink-0 ${inp ? KIND_CLASS[inp.kind] : ""}`}>
                          {formatFigure(inp, currency)}
                          {inp && !inp.verified && <Unverified compact />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Source</p>
            {f.sources.length ? (
              <ul className="mt-2 space-y-2">
                {f.sources.map((s, i) => (
                  <li key={i} className="rounded-xl border border-cream-300 bg-white p-3 text-sm">
                    <p className="font-medium text-ink">{s.file}</p>
                    <dl className="mt-1 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                      <dt className="text-muted">Sheet</dt>
                      <dd className="text-ink-soft">{s.sheet}</dd>
                      <dt className="text-muted">Column</dt>
                      <dd className="text-ink-soft">{s.column}</dd>
                      <dt className="text-muted">Period</dt>
                      <dd className="text-ink-soft">{/^\d{4}-\d{2}$/.test(s.period) ? periodLabel(s.period) : s.period}</dd>
                      {s.rows.length > 0 && (
                        <>
                          <dt className="text-muted">Row{s.rows.length > 1 ? "s" : ""}</dt>
                          <dd className="num text-ink-soft">{s.rows.join(", ")}</dd>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">{f.inputs.length ? "Calculated from the figures above; follow them to reach the source cells." : "No source. This figure cannot be traced to imported data."}</p>
            )}
          </div>
          <p className="font-mono text-[11px] break-all text-muted">ID: {f.id}</p>
        </div>
      </aside>
    </>
  );
}
