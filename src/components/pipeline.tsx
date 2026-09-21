"use client";

import { useEffect, useRef } from "react";
import type { ActivityItem } from "@/lib/client/use-pipeline";
import { STAGES, type Project, type StageId } from "@/lib/types";
import { Spinner } from "./ui";

function duration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export function PipelineStepper({ project, runningStage }: { project: Project; runningStage: StageId | null }) {
  return (
    <ol className="space-y-1">
      {STAGES.map((stage, i) => {
        const state = project.stages[stage.id];
        const status = runningStage === stage.id ? "running" : (state?.status ?? "pending");
        const took = status === "done" ? duration(state?.startedAt, state?.finishedAt) : null;
        return (
          <li key={stage.id} className="relative flex gap-3 rounded-xl px-2 py-2">
            {i < STAGES.length - 1 && (
              <span
                className={`absolute top-9 left-[1.3rem] h-[calc(100%-1.25rem)] w-px ${status === "done" ? "bg-orange-200" : "bg-cream-300"}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                status === "done"
                  ? "bg-orange-500 text-white"
                  : status === "running"
                    ? "bg-orange-100 text-orange-700 ring-2 ring-orange-500"
                    : status === "error"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-cream-200 text-muted"
              }`}
            >
              {status === "done" ? (
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : status === "running" ? (
                <Spinner className="size-3.5" />
              ) : status === "error" ? (
                "!"
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-sm font-medium ${status === "pending" ? "text-muted" : "text-ink"}`}>{stage.label}</p>
              <p className="text-xs text-muted">
                {status === "running"
                  ? `${stage.description}…`
                  : status === "error"
                    ? <span className="text-rose-700">{state?.error ?? "Failed"}</span>
                    : took
                      ? `Done in ${took}`
                      : stage.description}
              </p>
            </div>
            <span className="sr-only">Status: {status}</span>
          </li>
        );
      })}
    </ol>
  );
}

const KIND_ICON: Record<ActivityItem["kind"], string> = {
  progress: "•",
  search: "⌕",
  fetch: "↓",
  source: "↗",
  done: "✓",
  error: "!",
};

export function ActivityLog({ items, active }: { items: ActivityItem[]; active: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  if (!items.length) {
    return <p className="px-1 text-xs text-muted">{active ? "Starting…" : "Activity from the current run appears here."}</p>;
  }
  return (
    <div ref={scroller} className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-xs" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className="flex gap-2 leading-snug">
          <span
            className={`w-3 shrink-0 text-center ${
              item.kind === "error" ? "text-rose-700" : item.kind === "done" ? "text-sage-700" : item.kind === "search" ? "text-orange-600" : "text-muted"
            }`}
            aria-hidden="true"
          >
            {KIND_ICON[item.kind]}
          </span>
          <span className={`min-w-0 break-words ${item.kind === "error" ? "text-rose-700" : "text-ink-soft"}`}>
            {item.kind === "search" && <span className="text-muted">Searching </span>}
            {item.kind === "fetch" && <span className="text-muted">Reading </span>}
            {item.url && item.kind === "source" ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-orange-700 hover:underline">
                {item.text}
              </a>
            ) : (
              item.text
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
