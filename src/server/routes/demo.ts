import { Router } from "express";
import type { AppContext } from "../context.js";
import { DEMO_SCRIPT } from "../demo/script.js";
import { errorFields, log } from "../lib/logger.js";

/**
 * Demo mode: drive a meeting without Recall or Teams. The same code path as a
 * real meeting runs — only the transport is simulated.
 */
export function demoRoutes(ctx: AppContext): Router {
  const router = Router();

  router.post("/meetings", async (req, res) => {
    const body = req.body as { title?: string; modes?: Record<string, boolean> };
    const meeting = await ctx.orchestrator.createMeeting({
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/demo",
      title: body.title ?? "Atlas Launch — Sprint 12 standup (demo)",
      modes: { text: true, voice: false, video: false, ...(body.modes ?? {}) },
      demo: true,
    });
    res.status(201).json({ meeting });
  });

  router.post("/meetings/:id/utterance", async (req, res) => {
    const meeting = await ctx.store.getMeeting(req.params.id!);
    if (!meeting) {
      res.status(404).json({ error: "meeting not found" });
      return;
    }
    const body = req.body as { speaker?: string; text?: string; isFinal?: boolean };
    const utterance = await ctx.orchestrator.ingestUtterance(meeting, {
      speaker: body.speaker ?? "Speaker",
      participantId: null,
      text: String(body.text ?? ""),
      isFinal: body.isFinal ?? true,
      startRelative: null,
      endRelative: null,
    });
    res.json({ utterance });
  });

  router.post("/meetings/:id/chat", async (req, res) => {
    const meeting = await ctx.store.getMeeting(req.params.id!);
    if (!meeting) {
      res.status(404).json({ error: "meeting not found" });
      return;
    }
    const body = req.body as { sender?: string; text?: string };
    const message = await ctx.orchestrator.ingestChatMessage(meeting, {
      sender: body.sender ?? "Participant",
      text: String(body.text ?? ""),
    });
    res.json({ message });
  });

  /** Replays a scripted Sprint 12 standup so the dashboard has real content. */
  router.post("/meetings/:id/script", async (req, res) => {
    const meeting = await ctx.store.getMeeting(req.params.id!);
    if (!meeting) {
      res.status(404).json({ error: "meeting not found" });
      return;
    }
    const speed = Number((req.body as { speed?: number })?.speed ?? 1);
    res.json({ ok: true, lines: DEMO_SCRIPT.length });

    void (async () => {
      let elapsed = 0;
      for (const line of DEMO_SCRIPT) {
        await sleep(Math.max(120, (line.pauseMs ?? 900) / Math.max(speed, 0.1)));
        elapsed += 4;
        const current = await ctx.store.getMeeting(meeting.id);
        if (!current || current.status === "ended") return;
        await ctx.orchestrator.ingestUtterance(current, {
          speaker: line.speaker,
          participantId: null,
          text: line.text,
          isFinal: true,
          startRelative: elapsed,
          endRelative: elapsed + 4,
        });
      }
      log.info("demo script finished", { meetingId: meeting.id });
    })().catch((error) => log.error("demo script failed", errorFields(error)));
  });

  router.post("/meetings/:id/end", async (req, res) => {
    const meeting = await ctx.store.getMeeting(req.params.id!);
    if (!meeting) {
      res.status(404).json({ error: "meeting not found" });
      return;
    }
    const ended = await ctx.store.updateMeeting(meeting.id, {
      status: "ended",
      statusDetail: "Demo meeting ended.",
      endedAt: new Date().toISOString(),
      outputMediaActive: false,
    });
    ctx.bus.publish({ type: "meeting", meeting: ended });
    await ctx.orchestrator.buildReport(meeting.id);
    res.json({ meeting: ended, report: await ctx.store.getReport(meeting.id) });
  });

  return router;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
