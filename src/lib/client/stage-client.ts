"use client";

import type { StageEvent, StageId } from "../types";

export type ProgressEvent = Exclude<StageEvent, { type: "result" } | { type: "error" }>;

/** Calls one pipeline stage and reads its NDJSON event stream until the result arrives. */
export async function callStage(
  stage: StageId,
  body: unknown,
  onEvent: (event: ProgressEvent) => void,
  signal: AbortSignal,
): Promise<{ data: unknown; model: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/stages/${stage}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Could not reach the server. Check your connection and retry.");
  }

  if (!response.ok || !response.body) {
    let message = `The server returned an error (${response.status}).`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      if (response.status === 413) message = "The upload is too large. Remove some PDFs and retry.";
      if (response.status === 504) message = "The step took longer than the server allows. Retry this step.";
    }
    throw new Error(message);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue; // heartbeat
      const event = JSON.parse(line) as StageEvent;
      if (event.type === "result") return { data: event.data, model: event.model };
      if (event.type === "error") throw new Error(event.message);
      onEvent(event);
    }
  }
  throw new Error("The connection closed before this step finished (it may have hit the server time limit). Retry this step.");
}
