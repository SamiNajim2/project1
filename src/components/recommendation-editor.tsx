"use client";

import { useState } from "react";
import { updateProject } from "@/lib/client/storage";
import { effectiveRecommendation } from "@/lib/report";
import type { OptionId } from "@/lib/schemas";
import type { Project } from "@/lib/types";
import { ClaimList } from "./citations";
import { Button, Pill, inputClass } from "./ui";

export function RecommendationEditor({ project, disabled }: { project: Project; disabled: boolean }) {
  const strategy = project.outputs.strategy!;
  const rec = effectiveRecommendation(project)!;
  const [editing, setEditing] = useState(false);
  const [optionId, setOptionId] = useState<OptionId>(rec.optionId);
  const [headline, setHeadline] = useState(rec.headline);
  const [rationale, setRationale] = useState(rec.rationaleText ?? rec.rationaleClaims.map((c) => c.text).join("\n\n"));

  const startEditing = () => {
    setOptionId(rec.optionId);
    setHeadline(rec.headline);
    setRationale(rec.rationaleText ?? rec.rationaleClaims.map((c) => c.text).join("\n\n"));
    setEditing(true);
  };

  const hasDownstream = !!(project.outputs.business || project.outputs.summary);

  const save = () => {
    updateProject(project.id, (p) => ({
      ...p,
      recommendationEdit: { optionId, headline: headline.trim(), rationale: rationale.trim(), editedAt: new Date().toISOString() },
      downstreamStale: hasDownstream,
    }));
    setEditing(false);
  };

  const reset = () => {
    // If the edit was never propagated, downstream sections already match the AI recommendation.
    updateProject(project.id, (p) => ({ ...p, recommendationEdit: undefined, downstreamStale: p.downstreamStale ? false : hasDownstream }));
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Chosen option</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {strategy.options.map((o) => (
              <label
                key={o.id}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors ${
                  optionId === o.id ? "border-orange-500 bg-orange-50" : "border-cream-300 bg-white hover:border-cream-400"
                }`}
              >
                <input
                  type="radio"
                  name="option"
                  value={o.id}
                  checked={optionId === o.id}
                  onChange={() => setOptionId(o.id)}
                  className="mt-0.5 accent-orange-600"
                />
                <span>
                  <span className="font-semibold text-ink">Option {o.id}</span>
                  <span className="block text-ink-soft">{o.title}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rec-headline" className="text-sm font-medium text-ink">
            Headline
          </label>
          <input id="rec-headline" className={inputClass} value={headline} onChange={(e) => setHeadline(e.target.value)} required maxLength={1000} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rec-rationale" className="text-sm font-medium text-ink">
            Rationale
          </label>
          <textarea
            id="rec-rationale"
            className={`${inputClass} min-h-44`}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            required
            maxLength={10_000}
          />
          <p className="text-xs text-muted">Your edit replaces the AI recommendation in the report, the Markdown export and any sections you update afterwards.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!headline.trim() || !rationale.trim()}>
            Save recommendation
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50/60 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="orange">Option {rec.optionId}</Pill>
          {rec.option && <span className="text-sm font-medium text-ink-soft">{rec.option.title}</span>}
          {rec.edited && <Pill tone="green">Edited by you</Pill>}
        </div>
        <p className="mt-3 font-display text-xl leading-snug text-ink">{rec.headline}</p>
      </div>

      {rec.edited ? (
        <div className="space-y-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-soft">{rec.rationaleText}</div>
      ) : (
        <>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">Why this option</h3>
            <ClaimList claims={rec.rationaleClaims} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">Why not the other options</h3>
            <ClaimList claims={strategy.recommendation.whyNotOthers} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink">What would change this recommendation</h3>
            <ClaimList claims={strategy.recommendation.conditionsToRevisit} />
          </div>
        </>
      )}

      <div className="no-print flex flex-wrap gap-2 border-t border-cream-200 pt-5">
        <Button variant="secondary" onClick={startEditing} disabled={disabled}>
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" strokeLinejoin="round" />
          </svg>
          Edit recommendation
        </Button>
        {rec.edited && (
          <Button variant="ghost" onClick={reset} disabled={disabled}>
            Restore AI recommendation
          </Button>
        )}
      </div>
    </div>
  );
}
