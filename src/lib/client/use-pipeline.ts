"use client";

import { useEffect, useSyncExternalStore } from "react";
import { STAGE_IDS, type PdfPayload, type Project, type StageId } from "../types";
import { callStage, type ProgressEvent } from "./stage-client";
import { blobToBase64, getFile, getProject, updateProject } from "./storage";

export interface ActivityItem {
  id: number;
  stage: StageId;
  kind: ProgressEvent["type"] | "done" | "error";
  text: string;
  url?: string;
}

interface RunState {
  runningStage: StageId | null;
  activity: ActivityItem[];
}

const MAX_ACTIVITY = 250;
const IDLE: RunState = { runningStage: null, activity: [] };

// Runs live at module level so they keep going while the user navigates around the app.
const runStates = new Map<string, RunState>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let counter = 0;

function getRunState(projectId: string): RunState {
  return runStates.get(projectId) ?? IDLE;
}

function setRunState(projectId: string, update: (s: RunState) => RunState) {
  runStates.set(projectId, update(getRunState(projectId)));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function log(projectId: string, stage: StageId, kind: ActivityItem["kind"], text: string, url?: string) {
  setRunState(projectId, (s) => ({
    ...s,
    activity: [...s.activity.slice(-(MAX_ACTIVITY - 1)), { id: counter++, stage, kind, text, url }],
  }));
}

export function isRunning(projectId: string): boolean {
  return controllers.has(projectId);
}

/** The first stage that has not completed, or null when the project is complete. */
export function nextStage(project: Project): StageId | null {
  return STAGE_IDS.find((id) => project.stages[id]?.status !== "done" || !project.outputs[id]) ?? null;
}

export function usePipeline(projectId: string) {
  const state = useSyncExternalStore(subscribe, () => getRunState(projectId), () => IDLE);

  // A page reload mid-run leaves a stage marked running with nothing driving it.
  useEffect(() => {
    if (controllers.has(projectId)) return;
    updateProject(projectId, (p) => {
      const stale = STAGE_IDS.filter((id) => p.stages[id]?.status === "running");
      if (!stale.length) return p;
      const stages = { ...p.stages };
      for (const id of stale) stages[id] = { ...stages[id]!, status: "error", error: "Interrupted. Resume to continue." };
      return { ...p, stages };
    });
  }, [projectId]);

  return {
    ...state,
    run: (from: StageId, until?: StageId) => runPipeline(projectId, from, until),
    stop: () => controllers.get(projectId)?.abort(),
  };
}

export async function runPipeline(projectId: string, from: StageId, until: StageId = "summary") {
  if (controllers.has(projectId)) return;
  const controller = new AbortController();
  controllers.set(projectId, controller);
  const range = STAGE_IDS.slice(STAGE_IDS.indexOf(from), STAGE_IDS.indexOf(until) + 1);

  updateProject(projectId, (p) => {
    const stages = { ...p.stages };
    const outputs = { ...p.outputs };
    for (const id of range) {
      stages[id] = { status: "pending" };
      delete outputs[id];
    }
    return { ...p, stages, outputs };
  });

  try {
    for (const stage of range) {
      const project = getProject(projectId);
      if (!project) return;
      const startedAt = new Date().toISOString();
      setRunState(projectId, (s) => ({ ...s, runningStage: stage }));
      updateProject(projectId, (p) => ({ ...p, stages: { ...p.stages, [stage]: { status: "running", startedAt } } }));

      try {
        const body = await buildRequestBody(stage, project, (msg) => log(projectId, stage, "progress", msg));
        const { data, model } = await callStage(
          stage,
          body,
          (event) => {
            if (event.type === "progress") log(projectId, stage, "progress", event.message);
            if (event.type === "search") log(projectId, stage, "search", event.query);
            if (event.type === "fetch") log(projectId, stage, "fetch", event.url, event.url);
            if (event.type === "source") log(projectId, stage, "source", event.title, event.url);
          },
          controller.signal,
        );
        updateProject(projectId, (p) => ({
          ...p,
          model,
          outputs: { ...p.outputs, [stage]: data },
          stages: { ...p.stages, [stage]: { status: "done", startedAt, finishedAt: new Date().toISOString() } },
          downstreamStale: stage === "summary" ? false : p.downstreamStale,
        }));
        log(projectId, stage, "done", "Step complete");
      } catch (error) {
        const stopped = controller.signal.aborted;
        const message = stopped ? "Stopped. Resume to continue." : error instanceof Error ? error.message : "Unexpected error.";
        updateProject(projectId, (p) => ({
          ...p,
          stages: { ...p.stages, [stage]: { status: "error", startedAt, error: message } },
        }));
        log(projectId, stage, "error", message);
        return;
      }
    }
  } finally {
    controllers.delete(projectId);
    setRunState(projectId, (s) => ({ ...s, runningStage: null }));
  }
}

async function buildRequestBody(stage: StageId, project: Project, note: (msg: string) => void): Promise<unknown> {
  const { brief, outputs, recommendationEdit } = project;
  const base = { brief, plan: outputs.plan };
  switch (stage) {
    case "plan":
      return { brief };
    case "research":
      return { ...base, pdfs: await loadPdfs(project, note) };
    case "market":
      return { ...base, research: outputs.research };
    case "strategy":
      return { ...base, research: outputs.research, market: outputs.market };
    case "business":
      return { ...base, research: outputs.research, strategy: outputs.strategy, recommendationEdit };
    case "summary":
      return {
        ...base,
        research: outputs.research,
        market: outputs.market,
        strategy: outputs.strategy,
        business: outputs.business,
        recommendationEdit,
      };
  }
}

async function loadPdfs(project: Project, note: (msg: string) => void): Promise<PdfPayload[]> {
  const pdfs: PdfPayload[] = [];
  for (const file of project.brief.files) {
    try {
      const blob = await getFile(file.id);
      if (!blob) {
        note(`“${file.name}” is no longer in this browser's storage and was skipped.`);
        continue;
      }
      pdfs.push({ name: file.name, base64: await blobToBase64(blob) });
    } catch {
      note(`Could not read “${file.name}”; it was skipped.`);
    }
  }
  if (pdfs.length) note(`Attaching ${pdfs.length} PDF${pdfs.length > 1 ? "s" : ""} for review…`);
  return pdfs;
}
