"use client";

import Link from "next/link";
import { restoreSample, useHydrated, useProjects } from "@/lib/client/storage";
import { STAGE_IDS, type Project } from "@/lib/types";
import { Button, ButtonLink, Card, EmptyState, Header, Pill, Skeleton } from "@/components/ui";

function projectStatus(project: Project): { label: string; tone: "neutral" | "orange" | "green" | "red" } {
  const done = STAGE_IDS.filter((id) => project.stages[id]?.status === "done").length;
  if (STAGE_IDS.some((id) => project.stages[id]?.status === "running")) return { label: `Running · ${done}/6`, tone: "orange" };
  if (STAGE_IDS.some((id) => project.stages[id]?.status === "error")) return { label: `Needs attention · ${done}/6`, tone: "red" };
  if (done === STAGE_IDS.length) return { label: "Complete", tone: "green" };
  if (done === 0) return { label: "Not started", tone: "neutral" };
  return { label: `In progress · ${done}/6`, tone: "orange" };
}

function ProjectCard({ project }: { project: Project }) {
  const status = projectStatus(project);
  const headline = project.outputs.summary?.executiveSummary.headline;
  return (
    <Link href={`/projects/${project.id}`} className="group block focus-visible:outline-none">
      <Card className="flex h-full flex-col p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-orange-200 group-hover:shadow-lg group-focus-visible:ring-4 group-focus-visible:ring-orange-100">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-semibold text-ink">{project.brief.companyName}</h3>
          <div className="flex shrink-0 gap-1.5">
            {project.isSample && <Pill>Sample</Pill>}
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{project.brief.objective}</p>
        {headline && <p className="mt-3 line-clamp-2 border-l-2 border-orange-500 pl-3 text-sm text-ink">{headline}</p>}
        <p className="mt-auto pt-4 text-xs text-muted">
          {[project.brief.geography, `Updated ${new Date(project.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Card>
    </Link>
  );
}

export default function ProjectsPage() {
  const projects = useProjects();
  const hydrated = useHydrated();
  const sorted = [...projects].sort((a, b) => Number(!!a.isSample) - Number(!!b.isSample) || b.updatedAt.localeCompare(a.updatedAt));
  const hasSample = projects.some((p) => p.isSample);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6">
        <section aria-labelledby="projects-heading">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 id="projects-heading" className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Your projects
              </h1>
              <p className="mt-1 text-sm text-muted">Saved in this browser. Open the sample to see a finished report.</p>
            </div>
            <ButtonLink href="/projects/new" className="px-5 py-2.5">
              Start a strategy project
            </ButtonLink>
          </div>
          {!hydrated ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="space-y-3 p-5">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </Card>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              title="No projects yet"
              action={
                <>
                  <ButtonLink href="/projects/new">Create a project</ButtonLink>
                  <Button variant="secondary" onClick={restoreSample}>
                    Restore the sample project
                  </Button>
                </>
              }
            >
              Start with a company, a business question and any evidence you trust. The sample project shows a finished report.
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
          {hydrated && sorted.length > 0 && !hasSample && (
            <button onClick={restoreSample} className="mt-6 text-sm font-medium text-orange-700 hover:underline">
              Restore the sample project
            </button>
          )}
        </section>
      </main>
    </>
  );
}
