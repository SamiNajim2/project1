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

const FEATURES = [
  ["Live research", "Plans the research, searches the web and reads your PDFs, notes and URLs."],
  ["Every claim cited", "Facts link to their source. Estimates and assumptions are labeled; gaps say “More evidence needed”."],
  ["Decision-ready", "Competitors, segments, three options, an editable recommendation, a business case and a 90-day plan."],
] as const;

export default function Home() {
  const projects = useProjects();
  const hydrated = useHydrated();
  const sorted = [...projects].sort((a, b) => Number(!!a.isSample) - Number(!!b.isSample) || b.updatedAt.localeCompare(a.updatedAt));
  const hasSample = projects.some((p) => p.isSample);

  return (
    <>
      <Header>
        <ButtonLink href="/projects/new">New project</ButtonLink>
      </Header>
      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <section className="py-12 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-600">AI strategy consultant</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
            Turn a company brief into a strategy you can defend.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Strategy Agent researches the market, compares competitors, develops three options and recommends one, with sources for every fact.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/projects/new" className="px-5 py-2.5">
              Start a strategy project
            </ButtonLink>
            {hydrated && hasSample && (
              <ButtonLink href={`/projects/${projects.find((p) => p.isSample)!.id}`} variant="secondary" className="px-5 py-2.5">
                Open the sample project
              </ButtonLink>
            )}
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {FEATURES.map(([title, text], i) => (
              <div key={title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-orange-100 font-display text-sm font-semibold text-orange-700">{i + 1}</span>
                <div>
                  <p className="font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-sm text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="projects-heading">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="projects-heading" className="font-display text-2xl font-semibold text-ink">
              Your projects
            </h2>
            <p className="text-xs text-muted">Saved in this browser</p>
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
