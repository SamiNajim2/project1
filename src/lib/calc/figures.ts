import type { Figure, FigureKind, FigureUnit, SourceCell, SourceRef } from "../model";
import { round2 } from "../format";

/** All calculated figures of one analysis, addressable by stable ID. */
export class FigureRegistry {
  readonly figures = new Map<string, Figure>();

  add(figure: Figure): Figure {
    this.figures.set(figure.id, figure);
    return figure;
  }

  get(id: string): Figure | undefined {
    return this.figures.get(id);
  }

  /** Marks an existing figure unverified (e.g. after a failed reconciliation). */
  flag(id: string, reason: string) {
    const f = this.figures.get(id);
    if (f && !f.reasons.includes(reason)) {
      f.reasons.push(reason);
      f.verified = false;
    }
  }

  toRecord(): Record<string, Figure> {
    return Object.fromEntries(this.figures);
  }
}

export function groupSources(cells: SourceCell[], period: (c: SourceCell, i: number) => string): SourceRef[] {
  const groups = new Map<string, SourceRef>();
  cells.forEach((c, i) => {
    const p = period(c, i);
    const key = `${c.file}|${c.sheet}|${c.column}|${p}`;
    const g = groups.get(key);
    if (g) {
      if (!g.rows.includes(c.row)) g.rows.push(c.row);
    } else groups.set(key, { file: c.file, sheet: c.sheet, column: c.column, period: p, rows: [c.row] });
  });
  return [...groups.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => a - b) }));
}

interface LeafSpec {
  id: string;
  label: string;
  kind: FigureKind;
  unit?: FigureUnit;
  period?: string;
  formula: string;
  /** The records that make up the figure; empty means there is no source. */
  cells: { amount: number; source: SourceCell; period: string }[];
  /** Extra reasons (validation issues on the same data). */
  reasons?: string[];
  missingReason?: string;
}

/** A figure that sums source cells. Unverified when it has no source or its data has issues. */
export function leaf(reg: FigureRegistry, spec: LeafSpec): Figure {
  const reasons = [...new Set(spec.reasons ?? [])];
  let value: number | null = null;
  if (spec.cells.length === 0) reasons.unshift(spec.missingReason ?? "No source data");
  else value = round2(spec.cells.reduce((s, c) => s + c.amount, 0));
  return reg.add({
    id: spec.id,
    label: spec.label,
    value,
    unit: spec.unit ?? "currency",
    kind: spec.kind,
    period: spec.period,
    formula: spec.formula,
    inputs: [],
    sources: groupSources(
      spec.cells.map((c) => c.source),
      (_, i) => spec.cells[i].period,
    ),
    verified: reasons.length === 0,
    reasons,
  });
}

interface DerivedSpec {
  id: string;
  label: string;
  kind: FigureKind;
  unit: FigureUnit;
  period?: string;
  formula: string;
  inputs: (Figure | undefined)[];
  /** Receives input values (all non-null). Returning null means "not applicable". */
  compute: (values: number[]) => number | null;
  note?: string;
  reasons?: string[];
  sources?: SourceRef[];
}

/** A figure calculated from other figures. It is verified only if every input is verified. */
export function derive(reg: FigureRegistry, spec: DerivedSpec): Figure {
  const inputs = spec.inputs.filter((f): f is Figure => !!f);
  const reasons = [...(spec.reasons ?? [])];
  if (inputs.length !== spec.inputs.length) reasons.push("An input figure is missing");
  for (const f of inputs) if (!f.verified) reasons.push(`Depends on an unverified figure: ${f.label}`);
  const missing = inputs.some((f) => f.value === null);
  let value: number | null = null;
  if (!missing && inputs.length === spec.inputs.length) {
    const v = spec.compute(inputs.map((f) => f.value as number));
    value = v === null || !Number.isFinite(v) ? null : spec.unit === "currency" ? round2(v) : v;
  }
  return reg.add({
    id: spec.id,
    label: spec.label,
    value,
    unit: spec.unit,
    kind: spec.kind,
    period: spec.period,
    formula: spec.formula,
    inputs: inputs.map((f) => f.id),
    sources: spec.sources ?? [],
    verified: reasons.length === 0,
    reasons: [...new Set(reasons)],
    note: value === null ? spec.note : undefined,
  });
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
