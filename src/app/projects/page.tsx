"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteProject, listProjects, newId, putProject } from "@/lib/client/db";
import { createSampleProject } from "@/lib/client/sample";
import { periodLabel } from "@/lib/periods";
import { emptyProject, STEPS, type Project } from "@/lib/project";
import { Banner, Button, Card, EmptyState, Header, Pill, Spinner } from "@/components/ui";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState<"new" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch((e) => {
        setProjects([]);
        setError(e instanceof Error ? e.message : "Browser storage is unavailable");
      });
  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    setBusy("new");
    try {
      const p = emptyProject(newId());
      await putProject(p);
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a project");
      setBusy(null);
    }
  };
  const sample = async () => {
    setBusy("sample");
    try {
      const p = await createSampleProject();
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample");
      setBusy(null);
    }
  };
  const remove = async (p: Project) => {
    if (!confirm(`Delete “${p.settings.companyName || "Untitled project"}” and its imported data from this browser?`)) return;
    await deleteProject(p.id);
    void refresh();
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 pt-10 pb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Your projects</h1>
            <p className="mt-1 text-sm text-muted">
              Saved in this browser. Sample files (fictional company):{" "}
              {["brightwave_pnl_fy2026.xlsx", "brightwave_cash_2026.csv", "brightwave_mrr_2026.csv", "brightwave_forecast_drivers.xlsx"].map((f, i) => (
                <span key={f}>
                  {i > 0 && " · "}
                  <a href={`/samples/${f}`} download className="text-orange-700 hover:underline">
                    {f}
                  </a>
                </span>
              ))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={sample} disabled={!!busy}>
              {busy === "sample" ? (
                <>
                  <Spinner /> Loading sample…
                </>
              ) : (
                "Open the sample project"
              )}
            </Button>
            <Button onClick={create} disabled={!!busy}>
              New project
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4">
            <Banner tone="bad" title="Something went wrong">
              {error}
            </Banner>
          </div>
        )}

        <section aria-label="Projects">
          {projects === null ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-32" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState title="No projects yet" action={<Button onClick={sample}>Open the sample project</Button>}>
              Start from the sample to see the full workflow, or create a project and import your own files.
            </EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Card key={p.id} className="flex flex-col p-5">
                  <Link href={`/projects/${p.id}`} className="group">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-xl font-semibold text-ink group-hover:text-orange-700">{p.settings.companyName || "Untitled project"}</h3>
                      <div className="flex gap-1.5">
                        {p.isSample && <Pill>Sample</Pill>}
                        {p.review && <Pill tone="good">Reviewed</Pill>}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      {periodLabel(p.settings.reportingPeriod)} · {p.settings.currency} · {p.files.length} file{p.files.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-muted">Step: {STEPS.find((s) => s.id === p.step)?.label}</p>
                  </Link>
                  <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted">
                    <span>Updated {new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <button onClick={() => remove(p)} className="font-medium text-bad hover:underline">
                      Delete
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
