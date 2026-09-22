import { Router } from "express";
import type { AppContext } from "../context.js";
import { renderMediaPage } from "../media/page.js";
import { verifyMediaToken } from "../lib/tokens.js";
import { log } from "../lib/logger.js";

/**
 * The Output Media webpage and its event stream. The URL carries a signed,
 * expiring token, so the page is not open to anyone who guesses the address.
 */
export function mediaRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/media/:token", async (req, res) => {
    const meeting = await resolveMeeting(ctx, req.params.token!);
    if (!meeting) {
      res.status(403).send("This Zeno media link is invalid or has expired.");
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.send(
      renderMediaPage({ token: req.params.token!, modes: meeting.modes, meetingTitle: meeting.title }),
    );
  });

  router.get("/api/media/:token/stream", async (req, res) => {
    const meeting = await resolveMeeting(ctx, req.params.token!);
    if (!meeting) {
      res.status(403).json({ error: "invalid media token" });
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({
      type: "hello",
      meetingId: meeting.id,
      modes: meeting.modes,
      state: ctx.media.visualState(meeting.id),
    });

    const unsubscribe = ctx.media.subscribe(meeting.id, send);
    const heartbeat = setInterval(() => send({ type: "ping" }), 15000);
    log.info("media page connected", { meetingId: meeting.id });
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      log.info("media page disconnected", { meetingId: meeting.id });
    });
  });

  router.get("/api/media/:token/clip/:clipId", async (req, res) => {
    const meeting = await resolveMeeting(ctx, req.params.token!);
    if (!meeting) {
      res.status(403).json({ error: "invalid media token" });
      return;
    }
    const clip = ctx.media.getClip(req.params.clipId!);
    if (!clip) {
      res.status(404).json({ error: "clip expired" });
      return;
    }
    res.setHeader("content-type", clip.contentType);
    res.setHeader("cache-control", "no-store");
    res.send(clip.audio);
  });

  return router;
}

async function resolveMeeting(ctx: AppContext, token: string) {
  const verified = verifyMediaToken({ secret: ctx.env.WEBHOOK_SECRET, token });
  if (!verified) return null;
  return ctx.store.getMeeting(verified.meetingId);
}
