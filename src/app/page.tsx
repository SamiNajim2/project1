"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteProject, listProjects, newId, putProject } from "@/lib/client/db";
import { createSampleProject } from "@/lib/client/sample";
import { periodLabel } from "@/lib/periods";
import { emptyProject, STEPS, type Project } from "@/lib/project";
import { Banner, Button, Card, EmptyState, Logo, Pill, Spinner } from "@/components/ui";

const FEATURES = [
  ["Import & map", "Excel and CSV files are read in your browser, kept unchanged, and mapped to a standard finance model."],
  ["Verify every number", "Deterministic calculations with the formula and source cell behind each figure. Totals are reconciled; anything untraceable is marked UNVERIFIED."],
  ["Report", "Variances, three-scenario forecast, runway and MRR bridge, plus an investor update and board-pack section drafted from verified figures only."],
] as const;

export default function Home() {
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
      <header className="border-b border-cream-300/80 bg-cream-100/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Button onClick={create} disabled={!!busy}>
            New project
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="py-12 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-600">FP&A workbench</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">From spreadsheets to a board pack you can trace to the cell.</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">Upload actuals, budget, cash and MRR files. Finance Analyst validates them, reconciles totals, and produces variance analysis, forecasts, runway and reporting where every number shows its source.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button onClick={sample} disabled={!!busy} className="px-5 py-2.5">
              {busy === "sample" ? (
                <>
                  <Spinner /> Loading sample…
                </>
              ) : (
                "Open the sample project"
              )}
            </Button>
            <Button variant="secondary" onClick={create} disabled={!!busy} className="px-5 py-2.5">
              Start with your own files
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Sample files (fictional company):{" "}
            {["brightwave_pnl_fy2026.xlsx", "brightwave_cash_2026.csv", "brightwave_mrr_2026.csv", "brightwave_forecast_drivers.xlsx"].map((f, i) => (
              <span key={f}>
                {i > 0 && " · "}
                <a href={`/samples/${f}`} download className="text-orange-700 hover:underline">
                  {f}
                </a>
              </span>
            ))}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
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

        {error && (
          <div className="mb-4">
            <Banner tone="bad" title="Something went wrong">
              {error}
            </Banner>
          </div>
        )}

        <section aria-labelledby="projects">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="projects" className="font-display text-2xl font-semibold text-ink">
              Projects
            </h2>
            <p className="text-xs text-muted">Saved in this browser</p>
          </div>
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
