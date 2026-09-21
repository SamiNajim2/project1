"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Basis, Claim } from "@/lib/schemas";
import { BASIS_LABEL, sourcesFor, type CitationIndex } from "@/lib/report";

const CitationContext = createContext<CitationIndex | null>(null);

export function CitationProvider({ index, children }: { index: CitationIndex; children: ReactNode }) {
  return <CitationContext.Provider value={index}>{children}</CitationContext.Provider>;
}

function useCitations(): CitationIndex {
  const index = useContext(CitationContext);
  if (!index) throw new Error("CitationProvider missing");
  return index;
}

const BADGE_STYLES: Record<Basis, string> = {
  sourced: "",
  judgment: "",
  estimate: "bg-amber-100 text-amber-800",
  assumption: "bg-sand-100 text-sand-800",
  gap: "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
  unverified: "bg-rose-100 text-rose-700",
};

export function BasisBadge({ basis }: { basis: Basis }) {
  const label = BASIS_LABEL[basis];
  if (!label) return null;
  return (
    <span
      className={`ml-1.5 inline-flex translate-y-[-1px] items-center rounded-md px-1.5 py-px align-middle text-[10.5px] font-semibold uppercase tracking-wide ${BADGE_STYLES[basis]}`}
    >
      {label}
    </span>
  );
}

export function Citations({ evidenceIds }: { evidenceIds: string[] }) {
  const index = useCitations();
  const sources = sourcesFor(evidenceIds, index);
  if (!sources.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-0.5 align-baseline">
      {sources.map((s) => {
        const n = index.numbers.get(s.id);
        const quote = evidenceIds
          .map((id) => index.evidence.get(id))
          .flatMap((e) => e?.quotes ?? [])
          .find((q) => q.sourceId === s.id)?.quote;
        const title = `${s.title}${quote ? `\n\n“${quote.slice(0, 240)}${quote.length > 240 ? "…" : ""}”` : ""}`;
        const className =
          "inline-grid min-w-[1.35rem] place-items-center rounded-md bg-orange-50 px-1 text-[11px] font-semibold leading-5 text-orange-700 ring-1 ring-orange-100 transition-colors hover:bg-orange-100";
        return s.url ? (
          <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" title={title} className={className}>
            {n}
          </a>
        ) : (
          <a key={s.id} href={`#source-${s.id}`} title={title} className={className}>
            {n}
          </a>
        );
      })}
    </span>
  );
}

export function ClaimText({ claim, className = "" }: { claim: Claim; className?: string }) {
  const isGap = claim.basis === "gap";
  const text = isGap ? claim.text.replace(/^more evidence needed:?\s*/i, "") : claim.text;
  return (
    <span className={`${isGap || claim.basis === "unverified" ? "text-muted" : ""} ${className}`}>
      {isGap && <BasisBadge basis="gap" />} {text}
      {!isGap && <BasisBadge basis={claim.basis} />}
      <Citations evidenceIds={claim.evidenceIds} />
    </span>
  );
}

export function ClaimList({ claims, empty = "More evidence needed." }: { claims: Claim[]; empty?: string }) {
  if (!claims.length) return <p className="text-sm text-muted italic">{empty}</p>;
  return (
    <ul className="space-y-2">
      {claims.map((c, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-soft">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
          <ClaimText claim={c} />
        </li>
      ))}
    </ul>
  );
}

export function EvidenceGaps({ gaps }: { gaps: string[] }) {
  if (!gaps.length) return null;
  return (
    <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">More evidence needed</p>
      <ul className="mt-2 space-y-1 text-sm text-ink-soft">
        {gaps.map((g, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="text-rose-700">
              ?
            </span>
            {g}
          </li>
        ))}
      </ul>
    </div>
  );
}
