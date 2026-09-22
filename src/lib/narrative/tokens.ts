import { formatFigure } from "../format";
import type { Figure } from "../model";

export type NarrativeKind = "investor_update" | "board_pack";

export interface NarrativeSection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

export interface NarrativeFlag {
  section: string;
  text: string;
  reason: "number_not_from_figure" | "unknown_figure" | "unverified_figure" | "causal_claim";
  message: string;
}

export interface NarrativeDoc {
  kind: NarrativeKind;
  generatedAt: string;
  model: string;
  sections: NarrativeSection[];
  flags: NarrativeFlag[];
  /** Fingerprint of the analysis the draft was written from. */
  basis: string;
}

export type Segment =
  | { t: "text"; text: string }
  | { t: "fig"; id: string; text: string; verified: boolean; known: boolean }
  | { t: "flag"; text: string };

export const TOKEN = /\{\{F:([A-Za-z0-9_.:\-]+)\}\}/g;

/**
 * Numbers written directly by the model (not through a figure token). Years and period labels such
 * as "Q2" or "FY2026" are allowed; anything else is a figure the model may have invented.
 */
const LITERAL_NUMBER = /(?<![A-Za-z0-9_.])[-+]?[$€£¥]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:%|percent\b|pts?\b|k\b|m\b|bn\b|million\b|billion\b|x\b|×)?/gi;
const YEAR = /^(19|20)\d\d$/;

const CAUSAL = /\b(because|due to|driven by|as a result of|caused by|owing to|thanks to|led to|resulting from|attributable to)\b/i;

function literalNumbers(text: string): string[] {
  const plain = text.replace(TOKEN, " ");
  return (plain.match(LITERAL_NUMBER) ?? []).map((m) => m.trim()).filter((m) => !YEAR.test(m));
}

/** Splits narrative text into plain text, verified-figure chips and flagged literal numbers. */
export function toSegments(text: string, figures: Record<string, Figure>, currency: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const pushText = (chunk: string) => {
    let pos = 0;
    for (const m of chunk.matchAll(LITERAL_NUMBER)) {
      const value = m[0].trim();
      if (YEAR.test(value)) continue;
      const i = m.index ?? 0;
      if (i > pos) out.push({ t: "text", text: chunk.slice(pos, i) });
      out.push({ t: "flag", text: m[0] });
      pos = i + m[0].length;
    }
    if (pos < chunk.length) out.push({ t: "text", text: chunk.slice(pos) });
  };
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) pushText(text.slice(last, i));
    const f = figures[m[1]];
    out.push({ t: "fig", id: m[1], text: f ? formatFigure(f, currency, { compact: f.unit === "currency" && Math.abs(f.value ?? 0) >= 100_000 }) : "[unknown figure]", verified: !!f?.verified, known: !!f });
    last = i + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return out;
}

/** Plain text with figures substituted and problems marked, for Markdown export. */
export function toPlainText(text: string, figures: Record<string, Figure>, currency: string): string {
  return toSegments(text, figures, currency)
    .map((s) => (s.t === "fig" ? (s.verified ? `${s.text} [${s.id}]` : `${s.text} **UNVERIFIED** [${s.id}]`) : s.t === "flag" ? `${s.text} **UNVERIFIED**` : s.text))
    .join("");
}

/** Deterministic checks on a draft: every number must come from a verified figure; causal claims need review. */
export function checkNarrative(sections: NarrativeSection[], figures: Record<string, Figure>, hasCommentary: boolean): NarrativeFlag[] {
  const flags: NarrativeFlag[] = [];
  for (const section of sections) {
    for (const text of [...section.paragraphs, ...section.bullets]) {
      for (const m of text.matchAll(TOKEN)) {
        const f = figures[m[1]];
        if (!f) flags.push({ section: section.heading, text: m[0], reason: "unknown_figure", message: `The draft references a figure that does not exist (${m[1]}).` });
        else if (!f.verified) flags.push({ section: section.heading, text: f.label, reason: "unverified_figure", message: `"${f.label}" is unverified and must not be relied on.` });
      }
      for (const n of literalNumbers(text)) {
        flags.push({ section: section.heading, text: n, reason: "number_not_from_figure", message: `"${n}" was typed by the model rather than taken from a verified calculation.` });
      }
      for (const sentence of text.replace(TOKEN, "#").split(/(?<=[.!?])\s+/)) {
        if (CAUSAL.test(sentence)) {
          flags.push({
            section: section.heading,
            text: sentence.trim().slice(0, 160),
            reason: "causal_claim",
            message: hasCommentary ? "States a cause. Confirm it matches the management commentary you provided." : "States a cause, but no management commentary was provided. Confirm or remove it.",
          });
        }
      }
    }
  }
  return flags;
}
