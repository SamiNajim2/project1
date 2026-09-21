"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { deleteProject, useHydrated, useProjects } from "@/lib/client/storage";
import { isRunning, nextStage, runPipeline, usePipeline } from "@/lib/client/use-pipeline";
import { projectToMarkdown } from "@/lib/markdown";
import { buildCitationIndex, hasAnyOutput, slugify } from "@/lib/report";
import { STAGES, STAGE_IDS, type Project } from "@/lib/types";
import { CitationProvider } from "./citations";
import { ActivityLog, PipelineStepper } from "./pipeline";
import { REPORT_SECTIONS, Report, ResearchPlanCard } from "./report";
import { Button, ButtonLink, Card, EmptyState, ErrorBanner, Header, Pill, Skeleton, Spinner } from "./ui";

function downloadMarkdown(project: Project) {
  const blob = new Blob([projectToMarkdown(project)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(project.brief.companyName) || "strategy"}-strategy-report.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ProjectWorkspace({ id, autoRun }: { id: string; autoRun: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const projects = useProjects();
  const project = projects.find((p) => p.id === id);
  const { runningStage, activity, run, stop } = usePipeline(id);
  const index = useMemo(() => buildCitationIndex(project?.outputs.research), [project?.outputs.research]);

  // Start the analysis for a newly created project, then drop ?run=1 so a reload does not restart it.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoRun || !project || autoStarted.current) return;
    autoStarted.current = true;
    router.replace(`/projects/${id}`, { scroll: false });
    const stage = nextStage(project);
    if (stage && !isRunning(id) && !project.stages[stage]) void runPipeline(id, stage);
  }, [autoRun, project, id, router]);

  // Closing or reloading the tab stops the run; warn first.
  useEffect(() => {
    if (!runningStage) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [runningStage]);

  if (!hydrated) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-7xl space-y-4 px-4 pt-10 sm:px-6">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-full max-w-2xl" />
          <Skeleton className="mt-8 h-64 w-full" />
        </main>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 pt-16 sm:px-6">
          <EmptyState title="Project not found" action={<ButtonLink href="/">Back to projects</ButtonLink>}>
            Projects are saved in the browser they were created in. This one may have been deleted, or created on another device.
          </EmptyState>
        </main>
      </>
    );
  }

  const resumeFrom = nextStage(project);
  const complete = resumeFrom === null;
  const started = STAGE_IDS.some((s) => project.stages[s]);
  const failed = STAGE_IDS.find((s) => project.stages[s]?.status === "error");
  const failedLabel = STAGES.find((s) => s.id === failed)?.label;
  const busy = !!runningStage;
  const { brief } = project;

  const onRerun = () => {
    if (confirm("Run the full analysis again? The current report will be replaced.")) void run("plan");
  };
  const onDelete = async () => {
    if (!confirm(`Delete “${brief.companyName}”? This cannot be undone.`)) return;
    stop();
    await deleteProject(project.id);
    router.push("/");
  };

  return (
    <>
      <Header>
        <Button variant="secondary" onClick={() => downloadMarkdown(project)} disabled={!hasAnyOutput(project)}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">Export Markdown</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </Header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 sm:px-6">
        <Link href="/" className="no-print text-sm text-muted hover:text-orange-700">
          ← All projects
        </Link>

        <div className="mt-3 mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{brief.companyName}</h1>
              {project.isSample && <Pill>Sample project</Pill>}
            </div>
            <p className="mt-2 text-lg leading-snug text-ink-soft">{brief.objective}</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted hover:text-orange-700">Brief and inputs</summary>
              <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-xl border border-cream-300 bg-cream-50 p-4 sm:grid-cols-[10rem_1fr]">
                {(
                  [
                    ["Website", brief.website],
                    ["Target market", brief.targetMarket],
                    ["Geography", brief.geography],
                    ["Constraints", brief.constraints],
                    ["Notes", brief.notes],
                    ["Source URLs", brief.sourceUrls.join("\n")],
                    ["PDFs", brief.files.map((f) => f.name).join("\n")],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-medium text-ink">{k}</dt>
                      <dd className="break-words whitespace-pre-line text-ink-soft">{v}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="no-print space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2 px-2">
                <h2 className="text-sm font-semibold text-ink">Analysis</h2>
                {busy ? (
                  <Button variant="ghost" onClick={stop} className="px-2 py-1 text-xs">
                    Stop
                  </Button>
                ) : complete ? (
                  <Button variant="ghost" onClick={onRerun} className="px-2 py-1 text-xs">
                    Run again
                  </Button>
                ) : null}
              </div>
              <PipelineStepper project={project} runningStage={runningStage} />
              {!busy && !complete && resumeFrom && (
                <Button onClick={() => run(resumeFrom)} className="mt-3 w-full">
                  {!started ? "Start analysis" : failed ? `Retry: ${failedLabel}` : "Resume analysis"}
                </Button>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-ink">
                Activity {busy && <Spinner className="size-3.5 text-orange-600" />}
              </h2>
              <ActivityLog items={activity} active={busy} />
            </Card>

            <nav aria-label="Report sections" className="hidden rounded-2xl border border-cream-300 bg-cream-50 p-4 lg:block">
              <h2 className="mb-2 px-1 text-sm font-semibold text-ink">Report</h2>
              <ul className="space-y-0.5 text-sm">
                {REPORT_SECTIONS.map((s) => {
                  const ready = !!project.outputs[s.stage];
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={`flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-cream-200 ${ready ? "text-ink" : "text-muted"}`}
                      >
                        {s.title}
                        {ready && <span className="size-1.5 rounded-full bg-orange-500" aria-hidden="true" />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0 space-y-6">
            {failed && !busy && (
              <ErrorBanner
                title={`The “${failedLabel}” step did not finish`}
                message={project.stages[failed]?.error ?? "Unexpected error."}
                action={
                  <Button variant="secondary" onClick={() => run(failed)} className="shrink-0">
                    Retry step
                  </Button>
                }
              />
            )}
            {!started && !busy && (
              <EmptyState title="Ready to analyse" action={<Button onClick={() => run("plan")}>Start analysis</Button>}>
                Strategy Agent will plan the research, search the web, then build the report section by section. It usually takes 5–8 minutes.
              </EmptyState>
            )}
            <ResearchPlanCard project={project} />
            {(started || busy) && (
              <CitationProvider index={index}>
                <Report project={project} index={index} runningStage={runningStage} onRebuildDownstream={() => run("business", "summary")} />
              </CitationProvider>
            )}
            {complete && project.model && (
              <p className="text-center text-xs text-muted">
                Generated with {project.model} · {new Date(project.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
