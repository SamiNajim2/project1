"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SAMPLE_PROJECT, StorageFullError, newId, putFile, saveProject } from "@/lib/client/storage";
import type { Project, ProjectBrief, UploadedFileMeta } from "@/lib/types";
import { Button, Card, ErrorBanner, Field, inputClass } from "./ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10;

interface PendingFile {
  id: string;
  file: File;
}

type Errors = Partial<Record<"companyName" | "objective" | "website" | "sourceUrls" | "files", string>>;

function formatBytes(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function parseUrls(text: string): { urls: string[]; invalid: string[] } {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)) {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      if (!url.hostname.includes(".")) throw new Error("no tld");
      urls.push(url.toString());
    } catch {
      invalid.push(raw);
    }
  }
  return { urls: [...new Set(urls)], invalid };
}

function normalizeWebsite(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function ProjectForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    companyName: "",
    website: "",
    objective: "",
    targetMarket: "",
    geography: "",
    constraints: "",
    notes: "",
    urls: "",
  });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = [...list];
    const rejected: string[] = [];
    const accepted: PendingFile[] = [];
    let total = files.reduce((n, f) => n + f.file.size, 0);
    for (const file of incoming) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) rejected.push(`${file.name} is not a PDF`);
      else if (file.size > MAX_FILE_BYTES) rejected.push(`${file.name} is larger than 10 MB`);
      else if (total + file.size > MAX_TOTAL_BYTES) rejected.push(`${file.name} would exceed the 20 MB total`);
      else if (files.length + accepted.length >= MAX_FILES) rejected.push(`Only ${MAX_FILES} PDFs are allowed`);
      else {
        accepted.push({ id: newId(), file });
        total += file.size;
      }
    }
    setFiles((f) => [...f, ...accepted]);
    setErrors((e) => ({ ...e, files: rejected.length ? rejected.join(". ") : undefined }));
  };

  const fillExample = () => {
    const b = SAMPLE_PROJECT.brief;
    setForm({
      companyName: b.companyName,
      website: b.website,
      objective: b.objective,
      targetMarket: b.targetMarket,
      geography: b.geography,
      constraints: b.constraints,
      notes: b.notes,
      urls: b.sourceUrls.join("\n"),
    });
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const next: Errors = {};
    if (!form.companyName.trim()) next.companyName = "Enter the company name.";
    if (form.objective.trim().length < 10) next.objective = "Describe the business question in a sentence or two.";
    if (form.website.trim()) {
      try {
        new URL(normalizeWebsite(form.website));
      } catch {
        next.website = "Enter a valid website, e.g. example.com.";
      }
    }
    const { urls, invalid } = parseUrls(form.urls);
    if (invalid.length) next.sourceUrls = `Not valid URLs: ${invalid.join(", ")}`;
    else if (urls.length > 15) next.sourceUrls = "Add up to 15 URLs.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    try {
      const metas: UploadedFileMeta[] = [];
      for (const f of files) {
        await putFile(f.id, f.file);
        metas.push({ id: f.id, name: f.file.name, size: f.file.size });
      }
      const brief: ProjectBrief = {
        companyName: form.companyName.trim(),
        website: normalizeWebsite(form.website),
        objective: form.objective.trim(),
        targetMarket: form.targetMarket.trim(),
        geography: form.geography.trim(),
        constraints: form.constraints.trim(),
        notes: form.notes.trim(),
        sourceUrls: urls,
        files: metas,
      };
      const now = new Date().toISOString();
      const project: Project = { id: newId(), createdAt: now, updatedAt: now, brief, stages: {}, outputs: {} };
      saveProject(project);
      router.push(`/projects/${project.id}?run=1`);
    } catch (error) {
      setSubmitting(false);
      setSubmitError(
        error instanceof StorageFullError ? error.message : "Could not save the project in this browser. Check that site storage is enabled.",
      );
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card className="p-5 sm:p-7">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Company brief</h2>
            <p className="mt-1 text-sm text-muted">What the strategy project is about.</p>
          </div>
          <Button variant="ghost" onClick={fillExample} className="text-orange-700">
            Fill with example
          </Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Company name" htmlFor="companyName" required error={errors.companyName}>
            <input id="companyName" className={inputClass} value={form.companyName} onChange={set("companyName")} aria-invalid={!!errors.companyName} placeholder="Acme Robotics" maxLength={200} />
          </Field>
          <Field label="Website" htmlFor="website" error={errors.website}>
            <input id="website" className={inputClass} value={form.website} onChange={set("website")} aria-invalid={!!errors.website} placeholder="acme.com" inputMode="url" maxLength={500} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Business question or objective" htmlFor="objective" required error={errors.objective} hint="The decision this project should inform.">
              <textarea
                id="objective"
                className={`${inputClass} min-h-24`}
                value={form.objective}
                onChange={set("objective")}
                aria-invalid={!!errors.objective}
                placeholder="Should we enter the German mid-market, and if so, how?"
                maxLength={4000}
              />
            </Field>
          </div>
          <Field label="Target market" htmlFor="targetMarket">
            <input id="targetMarket" className={inputClass} value={form.targetMarket} onChange={set("targetMarket")} placeholder="Mid-sized logistics companies" maxLength={1000} />
          </Field>
          <Field label="Geography" htmlFor="geography">
            <input id="geography" className={inputClass} value={form.geography} onChange={set("geography")} placeholder="Germany, Austria, Switzerland" maxLength={500} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Important constraints" htmlFor="constraints" hint="Budget, timing, capabilities, things that are off the table.">
              <textarea id="constraints" className={`${inputClass} min-h-20`} value={form.constraints} onChange={set("constraints")} placeholder="Budget under €2M; no acquisitions; launch within 12 months" maxLength={4000} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-7">
        <h2 className="font-display text-xl font-semibold text-ink">Trusted evidence</h2>
        <p className="mt-1 mb-6 text-sm text-muted">Optional. The research step reads these first and cites them alongside web sources.</p>
        <div className="grid gap-5">
          <Field label="Notes" htmlFor="notes" hint="Internal facts, interview notes, figures you trust. They are cited as “Your notes”.">
            <textarea id="notes" className={`${inputClass} min-h-28`} value={form.notes} onChange={set("notes")} maxLength={60000} />
          </Field>
          <Field label="Source URLs" htmlFor="urls" error={errors.sourceUrls} hint="One per line. Each page is fetched and read.">
            <textarea
              id="urls"
              className={`${inputClass} min-h-20 font-mono text-[13px]`}
              value={form.urls}
              onChange={set("urls")}
              aria-invalid={!!errors.sourceUrls}
              placeholder={"https://example.com/annual-report\nhttps://example.com/pricing"}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">PDF files</span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                dragging ? "border-orange-500 bg-orange-50" : "border-cream-300 bg-white"
              }`}
            >
              <p className="text-sm text-ink-soft">Drag PDFs here, or</p>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                Choose files
              </Button>
              <p className="text-xs text-muted">Up to 10 files · 10 MB each · 20 MB total · stored only in this browser</p>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {errors.files && <p className="text-xs text-rose-700">{errors.files}</p>}
            {files.length > 0 && (
              <ul className="mt-2 divide-y divide-cream-200 rounded-xl border border-cream-300 bg-white">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-ink">{f.file.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted">{formatBytes(f.file.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((list) => list.filter((x) => x.id !== f.id))}
                        className="text-xs font-medium text-rose-700 hover:underline"
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {submitError && <ErrorBanner title="Could not create the project" message={submitError} />}

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted">The analysis runs six steps with live web research and usually takes 5–8 minutes.</p>
        <Button type="submit" disabled={submitting} className="px-6 py-2.5">
          {submitting ? "Creating…" : "Create project and start analysis"}
        </Button>
      </div>
    </form>
  );
}
