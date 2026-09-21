import "server-only";

// Figures that count as factual claims when they appear without evidence.
const FIGURE_PATTERN = /[$€£¥]\s?\d|\d[\d,.]*\s?(%|percent|per cent|million|billion|trillion|bn\b|mn\b)/i;

/**
 * Enforces the evidence rules on model output, recursively:
 * - evidence IDs that are not in the research evidence are removed;
 * - a claim presented as sourced with no valid evidence becomes "unverified";
 * - a judgment or gap that states a figure without evidence becomes "unverified";
 * - a business-case assumption marked sourced with no valid evidence becomes an "assumption".
 */
export function enforceEvidence<T>(value: T, validIds: ReadonlySet<string>): T {
  return walk(value, validIds) as T;
}

function walk(value: unknown, validIds: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(v, validIds));
  if (!value || typeof value !== "object") return value;

  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) obj[k] = walk(v, validIds);

  if (Array.isArray(obj.evidenceIds)) {
    const ids = [...new Set((obj.evidenceIds as unknown[]).filter((id): id is string => typeof id === "string"))]
      .map((id) => id.trim().toUpperCase())
      .filter((id) => validIds.has(id));
    obj.evidenceIds = ids;

    const isClaim = typeof obj.text === "string" && typeof obj.basis === "string";
    const isAssumption = typeof obj.label === "string" && typeof obj.value === "string" && typeof obj.basis === "string";

    if (isClaim && ids.length === 0) {
      if (obj.basis === "sourced") obj.basis = "unverified";
      else if ((obj.basis === "judgment" || obj.basis === "gap") && FIGURE_PATTERN.test(obj.text as string) && !isGapText(obj.text as string)) {
        obj.basis = "unverified";
      }
    }
    if (isAssumption && obj.basis === "sourced" && ids.length === 0) obj.basis = "assumption";
  }
  return obj;
}

function isGapText(text: string): boolean {
  return /^more evidence needed/i.test(text.trim());
}
