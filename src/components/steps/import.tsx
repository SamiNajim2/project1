"use client";

import { useRef, useState } from "react";
import { DATASET_LABELS } from "@/lib/fields";
import { autoMap, suggestSettings } from "@/lib/import/auto";
import { cellText, columnLetter, detectSheet } from "@/lib/import/detect";
import { parseFile } from "@/lib/import/parse";
import type { RawFile, RawSheet } from "@/lib/model";
import { periodLabel } from "@/lib/periods";
import { Banner, Button, Card, EmptyState, Pill, SectionTitle, Spinner } from "../ui";
import { useWorkspace } from "../workspace";

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function RawPreview({ sheet, headerRow }: { sheet: RawSheet; headerRow: number }) {
  const rows = sheet.rows.slice(0, Math.max(headerRow + 12, 14));
  const width = Math.min(rows.reduce((w, r) => Math.max(w, r.length), 0), 16);
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-cream-300 bg-white">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-cream-100 text-muted">
            <th className="sticky left-0 bg-cream-100 px-2 py-1 text-right font-medium">#</th>
            {Array.from({ length: width }, (_, c) => (
              <th key={c} className="px-2 py-1 text-left font-medium">
                {columnLetter(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className={r === headerRow ? "bg-orange-50 font-semibold text-ink" : r < headerRow ? "text-muted" : "text-ink-soft"}>
              <td className="num sticky left-0 border-r border-cream-200 bg-inherit px-2 py-1 text-right text-muted">{r + 1}</td>
              {Array.from({ length: width }, (_, c) => (
                <td key={c} className="max-w-48 truncate px-2 py-1 whitespace-nowrap">
                  {cellText(row[c] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-cream-200 px-3 py-1.5 text-[11px] text-muted">
        Raw data, read-only. Highlighted row: detected header. {sheet.rows.length > rows.length ? `${sheet.rows.length - rows.length} more rows not shown.` : ""}
        {sheet.truncated ? " The sheet was larger than 20,000 rows or 200 columns and was truncated." : ""}
      </p>
    </div>
  );
}

function SheetSummary({ file, sheet }: { file: RawFile; sheet: RawSheet }) {
  const { project } = useWorkspace();
  const [open, setOpen] = useState(false);
  const mapping = project.mappings[sheet.id];
  const d = detectSheet(sheet, mapping?.headerRow);
  const numericCols = d.columns.filter((c) => c.header && c.numeric > 0).length;
  void file;
  return (
    <div className="rounded-xl border border-cream-300 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{sheet.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {d.dataRows} data rows · header in row {d.headerRow + 1} · {d.headers.filter(Boolean).length} columns ({numericCols} numeric)
          </p>
        </div>
        <Pill tone={mapping?.kind === "ignore" ? "neutral" : "orange"}>{mapping ? DATASET_LABELS[mapping.kind] : "Not mapped"}</Pill>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted">Periods found</dt>
          <dd className="mt-0.5 text-ink-soft">{d.periods.length ? `${periodLabel(d.periods[0])} – ${periodLabel(d.periods.at(-1)!)} (${d.periods.length} months)` : "None detected"}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted">Currencies found</dt>
          <dd className="mt-0.5 text-ink-soft">{d.currencies.length ? d.currencies.join(", ") : "None stated"}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-muted">Layout</dt>
          <dd className="mt-0.5 text-ink-soft">{d.periodHeaderColumns.length >= 2 ? `Months across columns (${d.periodHeaderColumns.length})` : "One row per record"}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {d.columns
          .filter((c) => c.header)
          .slice(0, 18)
          .map((c) => (
            <span key={c.index} className="rounded-md bg-cream-100 px-1.5 py-0.5 text-[11px] text-ink-soft" title={`Samples: ${c.samples.join(", ")}`}>
              <span className="font-mono text-muted">{c.letter}</span> {c.header}
              <span className="text-muted"> · {c.periods >= c.nonEmpty * 0.8 && c.nonEmpty ? "period" : c.numeric >= c.nonEmpty * 0.8 && c.nonEmpty ? "number" : c.nonEmpty ? "text" : "empty"}</span>
            </span>
          ))}
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-3 text-xs font-medium text-orange-700 hover:underline">
        {open ? "Hide raw data" : "Preview raw data"}
      </button>
      {open && <RawPreview sheet={sheet} headerRow={d.headerRow} />}
    </div>
  );
}

export function ImportStep() {
  const { project, update, go } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [applied, setApplied] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    setBusy(true);
    setErrors([]);
    const parsed: RawFile[] = [];
    const errs: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > 25 * 1024 * 1024) {
        errs.push(`${file.name}: larger than 25 MB`);
        continue;
      }
      try {
        parsed.push(await parseFile(file));
      } catch (e) {
        errs.push(e instanceof Error ? e.message : `${file.name}: could not be read`);
      }
    }
    if (parsed.length) {
      const first = project.files.length === 0;
      const files = [...project.files, ...parsed];
      const suggested = suggestSettings(files, autoMap(files, project.mappings), project.settings);
      if (first && Object.keys(suggested).length) {
        setApplied(
          Object.entries(suggested)
            .map(([k, v]) => `${k === "companyName" ? "company" : k === "reportingPeriod" ? "reporting month" : k}: ${k === "reportingPeriod" ? periodLabel(String(v)) : v}`)
            .join(" · "),
        );
      }
      update((p) => {
        const all = [...p.files, ...parsed];
        const mappings = autoMap(all, p.mappings);
        const settings = first ? { ...p.settings, ...suggested } : { ...p.settings, companyName: p.settings.companyName || suggested.companyName || "" };
        return { ...p, files: all, mappings, settings, review: null };
      });
    }
    setErrors(errs);
    setBusy(false);
  };

  const remove = (file: RawFile) => {
    if (!confirm(`Remove ${file.name}? Its raw data and mappings are deleted from this project.`)) return;
    update((p) => {
      const mappings = { ...p.mappings };
      file.sheets.forEach((s) => delete mappings[s.id]);
      return { ...p, files: p.files.filter((f) => f.id !== file.id), mappings, review: null };
    });
  };

  return (
    <div className="space-y-5">
      <SectionTitle title="Import files" subtitle="Excel (.xlsx) and CSV files are read in your browser and stored unchanged. Every later step works on a mapped copy." />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-orange-500 bg-orange-50" : "border-cream-400 bg-cream-50"}`}
      >
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <Spinner /> Reading files…
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-soft">Drop P&L, budget, prior-period, cash, MRR and driver files here</p>
            <Button variant="secondary" onClick={() => input.current?.click()}>
              Choose files
            </Button>
            <p className="text-xs text-muted">.xlsx or .csv · up to 25 MB each · multiple sheets supported</p>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 && (
        <Banner tone="bad" title="Some files could not be imported">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Banner>
      )}
      {applied && <Banner tone="good" title="Settings detected from the files">{applied}. Check them in Company & period.</Banner>}

      {project.files.length === 0 ? (
        <EmptyState title="No files yet">Add your P&L actuals, budget and prior-period data, plus cash, MRR and forecast driver files. The sample project on the home page shows the expected shapes.</EmptyState>
      ) : (
        project.files.map((file) => (
          <Card key={file.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-ink">{file.name}</p>
                <p className="text-xs text-muted">
                  {file.format.toUpperCase()} · {formatSize(file.size)} · {file.sheets.length} sheet{file.sheets.length > 1 ? "s" : ""} · imported {new Date(file.importedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
              <Button variant="danger" onClick={() => remove(file)}>
                Remove
              </Button>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {file.sheets.map((sheet) => (
                <SheetSummary key={sheet.id} file={file} sheet={sheet} />
              ))}
            </div>
          </Card>
        ))
      )}
      {project.files.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => go("mapping")}>Review the column mapping</Button>
        </div>
      )}
    </div>
  );
}
