"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { analysisFingerprint, runAnalysis, type Analysis } from "@/lib/analysis";
import { useProject, type SaveState } from "@/lib/client/db";
import type { NormalizeResult } from "@/lib/normalize";
import { periodLabel } from "@/lib/periods";
import { fingerprint, prepareInput, STEPS, type Project, type StepId } from "@/lib/project";
import type { AnalysisInput } from "@/lib/model";
import { AccountMenu } from "./account-menu";
import { FigureProvider } from "./figure";
import { ForecastStep } from "./steps/forecast";
import { ImportStep } from "./steps/import";
import { MappingStep } from "./steps/mapping";
import { MrrStep } from "./steps/mrr";
import { QualityStep } from "./steps/quality";
import { RegisterStep } from "./steps/register";
import { ReportsStep } from "./steps/reports";
import { SetupStep } from "./steps/setup";
import { VarianceStep } from "./steps/variance";
import { Banner, ButtonLink, EmptyState, Logo, Spinner } from "./ui";

export interface WorkspaceCtx {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  go: (step: StepId) => void;
  input: AnalysisInput;
  normalized: NormalizeResult;
  analysis: Analysis;
  /** Fingerprint of the analysis figures (narratives are stale when it changes). */
  analysisKey: string;
  /** Fingerprint of everything a reviewer signs off. */
  reviewKey: string;
}

const Ctx = createContext<WorkspaceCtx | null>(null);
export function useWorkspace(): WorkspaceCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("Workspace context missing");
  return c;
}

const STEP_COMPONENTS: Record<StepId, () => ReactNode> = {
  setup: SetupStep,
  import: ImportStep,
  mapping: MappingStep,
  quality: QualityStep,
  variance: VarianceStep,
  forecast: ForecastStep,
  mrr: MrrStep,
  reports: ReportsStep,
  register: RegisterStep,
};

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="text-xs text-muted">Saving…</span>;
  if (state === "error") return <span className="text-xs font-medium text-bad">Not saved</span>;
  return <span className="text-xs text-muted">Saved in this browser</span>;
}

export function Workspace({ id }: { id: string }) {
  const { project, update, saveState, error } = useProject(id);

  const computed = useMemo(() => {
    if (!project) return null;
    const { input, normalized } = prepareInput(project);
    const analysis = runAnalysis(input);
    const analysisKey = analysisFingerprint(analysis);
    const reviewKey = fingerprint([analysisKey, project.narratives, input.drivers, project.commentary]);
    return { input, normalized, analysis, analysisKey, reviewKey };
    // Only the inputs to the analysis matter; the step and review do not change figures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.files, project?.mappings, project?.treatments, project?.settings, project?.driverEdits, project?.narratives, project?.commentary]);

  if (error && !project) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-24">
        <Banner tone="bad" title="Could not open browser storage">
          {error}
        </Banner>
      </main>
    );
  }
  if (project === undefined || (project && !computed)) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (project === null) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-24">
        <EmptyState title="Project not found" action={<ButtonLink href="/projects">Back to projects</ButtonLink>}>
          Projects are saved in the browser where they were created.
        </EmptyState>
      </main>
    );
  }

  const ctx: WorkspaceCtx = { project, update, go: (step) => update((p) => ({ ...p, step })), ...computed! };
  const a = computed!.analysis;
  const errors = a.issues.filter((i) => i.severity === "error").length;
  const badge: Partial<Record<StepId, ReactNode>> = {
    import: project.files.length ? <span className="text-xs text-muted">{project.files.length}</span> : null,
    quality: errors ? <span className="rounded-full bg-bad-bg px-1.5 text-xs font-semibold text-bad">{errors}</span> : a.summary.checksFailed ? <span className="rounded-full bg-warn-bg px-1.5 text-xs font-semibold text-warn">{a.summary.checksFailed}</span> : null,
    reports: Object.keys(project.narratives).length ? <span className="text-xs text-muted">{Object.keys(project.narratives).length}/2</span> : null,
    register: project.review?.fingerprint === computed!.reviewKey ? <span className="text-xs font-semibold text-good">✓</span> : null,
  };
  const Step = STEP_COMPONENTS[project.step] ?? SetupStep;
  const index = STEPS.findIndex((s) => s.id === project.step);

  return (
    <Ctx.Provider value={ctx}>
      <FigureProvider figures={a.figures} currency={project.settings.currency}>
        <header className="sticky top-0 z-30 border-b border-cream-300/80 bg-cream-100/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-4">
              <Logo />
              <span className="hidden truncate text-sm text-ink-soft md:inline">
                {project.settings.companyName || "Untitled project"} · {periodLabel(project.settings.reportingPeriod)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden md:inline">
                <SaveIndicator state={saveState} />
              </span>
              <AccountMenu />
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Workflow" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
              {STEPS.map((s, i) => {
                const active = s.id === project.step;
                return (
                  <li key={s.id} className="shrink-0">
                    <button
                      onClick={() => ctx.go(s.id)}
                      aria-current={active ? "step" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "bg-cream-50 font-medium text-ink shadow-card ring-1 ring-cream-300" : "text-ink-soft hover:bg-cream-200"}`}
                    >
                      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${active ? "bg-orange-500 text-white" : i < index ? "bg-orange-100 text-orange-700" : "bg-cream-200 text-muted"}`}>{i + 1}</span>
                      <span className="flex-1 whitespace-nowrap lg:whitespace-normal">{s.label}</span>
                      {badge[s.id]}
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 hidden rounded-xl border border-cream-300 bg-cream-50 p-3 text-xs text-muted lg:block">
              <p className="font-medium text-ink-soft">Verification</p>
              <p className="mt-1">
                <span className="num font-semibold text-good">{a.summary.verified}</span> verified ·{" "}
                <span className={`num font-semibold ${a.summary.unverified ? "text-bad" : "text-muted"}`}>{a.summary.unverified}</span> unverified
              </p>
              <p className="mt-0.5">
                Checks: <span className="num">{a.summary.checksPassed}</span> passed, <span className={`num ${a.summary.checksFailed ? "font-semibold text-bad" : ""}`}>{a.summary.checksFailed}</span> failed
              </p>
            </div>
          </nav>
          <main className="min-w-0">
            <Step />
            <div className="mt-8 flex justify-between border-t border-cream-300 pt-4">
              {index > 0 ? (
                <button onClick={() => ctx.go(STEPS[index - 1].id)} className="text-sm text-muted hover:text-orange-700">
                  ← {STEPS[index - 1].label}
                </button>
              ) : (
                <span />
              )}
              {index < STEPS.length - 1 && (
                <button onClick={() => ctx.go(STEPS[index + 1].id)} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                  Next: {STEPS[index + 1].label} →
                </button>
              )}
            </div>
          </main>
        </div>
      </FigureProvider>
    </Ctx.Provider>
  );
}
