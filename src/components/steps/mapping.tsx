"use client";

import { CATEGORY_LABELS, DATASET_LABELS, DRIVER_DEFS, FIELDS, SCENARIO_LABELS, SUBTOTAL_LABELS } from "@/lib/fields";
import { detectSheet, suggestMapping } from "@/lib/import/detect";
import type { AccountTreatment, AnyField, Category, DatasetKind, PnlScenario, RawSheet, SheetMapping, SubtotalKind } from "@/lib/model";
import { requiredMissing } from "@/lib/normalize";
import { CURRENCIES } from "@/lib/numbers";
import { Banner, Card, EmptyState, Pill, SectionTitle, inputClass } from "../ui";
import { useWorkspace } from "../workspace";

const TREATMENTS: { value: AccountTreatment; label: string }[] = [
  ...(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ value: c as AccountTreatment, label: CATEGORY_LABELS[c] })),
  ...(Object.keys(SUBTOTAL_LABELS) as SubtotalKind[]).map((k) => ({ value: `subtotal:${k}` as AccountTreatment, label: `Reported subtotal: ${SUBTOTAL_LABELS[k]} (reconcile only)` })),
  { value: "exclude", label: "Exclude from analysis" },
];

function SheetMappingCard({ sheet, fileName }: { sheet: RawSheet; fileName: string }) {
  const { project, update } = useWorkspace();
  const m = project.mappings[sheet.id];
  if (!m) return null;
  const d = detectSheet(sheet, m.headerRow);
  const set = (patch: Partial<SheetMapping>) => update((p) => ({ ...p, mappings: { ...p.mappings, [sheet.id]: { ...p.mappings[sheet.id], ...patch } }, review: null }));
  const setColumn = (field: AnyField, value: number | null) => set({ columns: { ...m.columns, [field]: value } });
  const columnOptions = d.columns.filter((c) => c.header || c.nonEmpty);
  const missing = m.kind === "ignore" ? [] : requiredMissing(m);

  const changeKind = (kind: DatasetKind | "ignore") => {
    const suggested = suggestMapping(sheet, d, kind);
    set({ ...suggested, headerRow: m.headerRow });
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{sheet.name}</p>
          <p className="text-xs text-muted">{fileName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {m.kind !== "ignore" && (missing.length ? <Pill tone="bad">Incomplete</Pill> : <Pill tone="good">Mapped</Pill>)}
          <select aria-label="Dataset type" className={`${inputClass} w-auto`} value={m.kind} onChange={(e) => changeKind(e.target.value as DatasetKind | "ignore")}>
            {(Object.keys(DATASET_LABELS) as (DatasetKind | "ignore")[]).map((k) => (
              <option key={k} value={k}>
                {DATASET_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {m.kind !== "ignore" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-ink-soft">
              Header row
              <input type="number" min={1} max={Math.min(sheet.rows.length, 50)} className={`${inputClass} mt-1`} value={m.headerRow + 1} onChange={(e) => set({ headerRow: Math.max(0, Number(e.target.value) - 1) })} />
            </label>
            {m.kind === "pnl" && (
              <label className="text-xs font-medium text-ink-soft">
                Layout
                <select className={`${inputClass} mt-1`} value={m.layout} onChange={(e) => set({ layout: e.target.value as "long" | "wide", periodColumns: e.target.value === "wide" ? d.periodHeaderColumns : [] })}>
                  <option value="wide">Months across columns</option>
                  <option value="long">One row per amount</option>
                </select>
              </label>
            )}
            {m.kind === "pnl" && m.columns.scenario == null && (
              <label className="text-xs font-medium text-ink-soft">
                Every row is
                <select className={`${inputClass} mt-1`} value={m.fixedScenario ?? ""} onChange={(e) => set({ fixedScenario: (e.target.value || null) as PnlScenario | null })}>
                  {(Object.keys(SCENARIO_LABELS) as PnlScenario[]).map((s) => (
                    <option key={s} value={s}>
                      {SCENARIO_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {m.kind !== "drivers" && m.columns.currency == null && (
              <label className="text-xs font-medium text-ink-soft">
                Sheet currency
                <select className={`${inputClass} mt-1`} value={m.fixedCurrency ?? ""} onChange={(e) => set({ fixedCurrency: e.target.value || null })}>
                  <option value="">Not stated</option>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS[m.kind].map((def) => {
              if (m.kind === "pnl" && m.layout === "wide" && (def.field === "period" || def.field === "amount")) return null;
              const value = m.columns[def.field] ?? null;
              return (
                <label key={def.field} className="text-xs font-medium text-ink-soft">
                  {def.label}
                  {def.required && <span className="text-orange-600"> *</span>}
                  <select className={`${inputClass} mt-1 ${def.required && value === null ? "border-bad" : ""}`} value={value ?? ""} onChange={(e) => setColumn(def.field, e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">— not mapped —</option>
                    {columnOptions.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.letter} · {c.header || "(no header)"}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          {m.kind === "pnl" && m.layout === "wide" && (
            <div>
              <p className="text-xs font-medium text-ink-soft">Month columns</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {d.columns
                  .filter((c) => c.header)
                  .map((c) => {
                    const on = m.periodColumns.includes(c.index);
                    return (
                      <button
                        key={c.index}
                        onClick={() => set({ periodColumns: on ? m.periodColumns.filter((x) => x !== c.index) : [...m.periodColumns, c.index].sort((a, b) => a - b) })}
                        className={`rounded-md px-2 py-1 text-xs ring-1 ${on ? "bg-orange-50 text-orange-700 ring-orange-200" : "bg-white text-muted ring-cream-300"}`}
                      >
                        {c.header}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {m.kind === "pnl" && (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="accent-orange-600" checked={m.costsNegative} onChange={(e) => set({ costsNegative: e.target.checked })} />
              Costs are stored as negative numbers (convert them to positive; each conversion is logged)
            </label>
          )}
          {m.kind === "mrr" && (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="accent-orange-600" checked={m.lossesNegative} onChange={(e) => set({ lossesNegative: e.target.checked })} />
              Contraction and churn are stored as negative numbers (use their size; logged)
            </label>
          )}
          {m.kind === "drivers" && (
            <p className="text-xs text-muted">
              Recognised drivers: {Object.values(DRIVER_DEFS).map((x) => x.label).join("; ")}. Percentages are entered as percent points (3 = 3%).
            </p>
          )}
          {missing.length > 0 && <Banner tone="bad" title="This sheet is not used yet">Map the required fields: {missing.join(", ")}.</Banner>}
        </div>
      )}
    </Card>
  );
}

export function MappingStep() {
  const { project, update, normalized } = useWorkspace();
  const sheets = project.files.flatMap((f) => f.sheets.filter((s) => s.rows.length).map((s) => ({ sheet: s, fileName: f.name })));
  if (!sheets.length) return <EmptyState title="Nothing to map yet">Import files first.</EmptyState>;

  return (
    <div className="space-y-5">
      <SectionTitle title="Map columns to the finance model" subtitle="Suggestions come from sheet names and headers. Nothing is used until it is mapped here; the raw files stay unchanged." />
      {sheets.map(({ sheet, fileName }) => (
        <SheetMappingCard key={sheet.id} sheet={sheet} fileName={fileName} />
      ))}

      {normalized.accounts.length > 0 && (
        <Card className="p-5">
          <h3 className="font-display text-lg font-semibold text-ink">Account classification</h3>
          <p className="mt-1 mb-4 text-sm text-muted">How each P&L line is treated. Reported subtotals such as “Total revenue” are never added into totals; they are reconciled against the sum of the lines.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-cream-300 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Account</th>
                  <th className="py-2 pr-3 font-semibold">Category in file</th>
                  <th className="py-2 font-semibold">Treatment</th>
                </tr>
              </thead>
              <tbody>
                {normalized.accounts.map((acc) => {
                  const value = project.treatments[acc.name] ?? acc.suggested;
                  const overridden = project.treatments[acc.name] !== undefined;
                  return (
                    <tr key={acc.name} className="border-b border-cream-200">
                      <td className="py-2 pr-3 text-ink">{acc.name}</td>
                      <td className="py-2 pr-3 text-muted">{acc.category ?? "—"}</td>
                      <td className="py-2">
                        <select className={`${inputClass} ${overridden ? "border-orange-500" : ""}`} value={value} onChange={(e) => update((p) => ({ ...p, treatments: { ...p.treatments, [acc.name]: e.target.value as AccountTreatment }, review: null }))}>
                          {TREATMENTS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
