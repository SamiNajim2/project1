import { Router, type Request, type Response } from "express";
import express from "express";
import type { AppContext } from "../context.js";
import { errorFields, log } from "../lib/logger.js";
import { VerificationError, verifyRequestFromRecall } from "../recall/verify.js";
import type { BotStatusChangeEvent, RealtimeEvent } from "../recall/types.js";

/**
 * Both Recall webhook endpoints. Each one verifies the signature against the raw
 * body, acknowledges immediately, and does the real work asynchronously.
 */
export function webhookRoutes(ctx: AppContext): Router {
  const router = Router();
  const raw = express.raw({ type: () => true, limit: "5mb" });

  router.post("/recall/status", raw, (req, res) => {
    handle(ctx, req, res, "status", async (payload) => {
      await ctx.orchestrator.handleBotStatus(payload as BotStatusChangeEvent);
    });
  });

  router.post("/recall/realtime", raw, (req, res) => {
    handle(ctx, req, res, "realtime", async (payload) => {
      await ctx.orchestrator.handleRealtimeEvent(payload as RealtimeEvent);
    });
  });

  return router;
}

function handle(
  ctx: AppContext,
  req: Request,
  res: Response,
  kind: string,
  process: (payload: unknown) => Promise<void>,
): void {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  try {
    verifyRequestFromRecall({
      secret: ctx.env.WEBHOOK_SECRET,
      headers: req.headers as Record<string, string | undefined>,
      payload: rawBody,
    });
  } catch (error) {
    // Unverified requests are rejected and never stored or processed.
    log.warn("rejected unverified recall request", {
      kind,
      path: req.path,
      reason: error instanceof VerificationError ? error.message : "verification failed",
    });
    res.status(401).json({ error: "request verification failed" });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "invalid json" });
    return;
  }

  const eventName = (payload as { event?: string }).event ?? "unknown";
  log.debug("recall webhook accepted", { kind, event: eventName });

  // Acknowledge first, then process: Recall retries anything that is slow or non-2xx.
  res.status(200).json({ ok: true });
  void process(payload).catch((error) => {
    log.error("webhook processing failed", { kind, event: eventName, ...errorFields(error) });
  });
}
