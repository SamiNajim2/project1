import type { Basis, Claim, Evidence, OptionId, ResearchResult, Source, StrategicOption } from "./schemas";
import type { Project } from "./types";

export interface CitationIndex {
  evidence: Map<string, Evidence>;
  sources: Map<string, Source>;
  /** Display number for each cited source, in order of first citation in the evidence. */
  numbers: Map<string, number>;
}

export function buildCitationIndex(research?: ResearchResult): CitationIndex {
  const evidence = new Map((research?.evidence ?? []).map((e) => [e.id, e]));
  const sources = new Map((research?.sources ?? []).map((s) => [s.id, s]));
  const numbers = new Map<string, number>();
  for (const s of research?.sources ?? []) {
    if (s.cited) numbers.set(s.id, numbers.size + 1);
  }
  return { evidence, sources, numbers };
}

/** Sources behind a set of evidence IDs, de-duplicated, in display order. */
export function sourcesFor(evidenceIds: string[], index: CitationIndex): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const id of evidenceIds) {
    for (const sid of index.evidence.get(id)?.sourceIds ?? []) {
      const source = index.sources.get(sid);
      if (source && !seen.has(sid)) {
        seen.add(sid);
        out.push(source);
      }
    }
  }
  return out.sort((a, b) => (index.numbers.get(a.id) ?? 0) - (index.numbers.get(b.id) ?? 0));
}

export const BASIS_LABEL: Record<Basis, string | null> = {
  sourced: null,
  judgment: null,
  estimate: "Estimate",
  assumption: "Assumption",
  gap: "More evidence needed",
  unverified: "Unverified — more evidence needed",
};

export interface EffectiveRecommendation {
  optionId: OptionId;
  option?: StrategicOption;
  headline: string;
  rationaleClaims: Claim[];
  rationaleText?: string;
  edited: boolean;
}

export function effectiveRecommendation(project: Project): EffectiveRecommendation | null {
  const strategy = project.outputs.strategy;
  if (!strategy) return null;
  const edit = project.recommendationEdit;
  const optionId = edit?.optionId ?? strategy.recommendation.optionId;
  return {
    optionId,
    option: strategy.options.find((o) => o.id === optionId),
    headline: edit?.headline ?? strategy.recommendation.headline,
    rationaleClaims: edit ? [] : strategy.recommendation.rationale,
    rationaleText: edit?.rationale,
    edited: !!edit,
  };
}

export function hasAnyOutput(project: Project): boolean {
  return Object.keys(project.outputs).length > 0;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
