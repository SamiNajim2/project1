import "server-only";
import type { StageEvent } from "../types";
import { describeError } from "./anthropic";

const HEARTBEAT_MS = 10_000;

/**
 * Streams stage events as newline-delimited JSON. A blank-line heartbeat keeps proxies from closing
 * the connection during long silent periods (e.g. while the model is thinking or searching).
 */
export function ndjsonResponse(
  request: Request,
  run: (emit: (event: StageEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const emit = (event: StageEvent) => write(`${JSON.stringify(event)}\n`);
      const heartbeat = setInterval(() => write("\n"), HEARTBEAT_MS);

      try {
        await run(emit, request.signal);
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[stage] failed:", error);
          emit({ type: "error", message: describeError(error) });
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by a client disconnect
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
