import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { applyProposal, cancelProposal, pendingProposal } from "../agent/approvals.js";
import { errorFields, log } from "../lib/logger.js";

const createSchema = z.object({
  meetingUrl: z.string().url("Paste the full meeting link, including https://"),
  title: z.string().max(200).optional(),
  modes: z
    .object({ text: z.boolean().optional(), voice: z.boolean().optional(), video: z.boolean().optional() })
    .optional(),
  demo: z.boolean().optional(),
});

const modesSchema = z.object({
  text: z.boolean().optional(),
  voice: z.boolean().optional(),
  video: z.boolean().optional(),
});

export function meetingRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json({ meetings: await ctx.store.listMeetings(50) });
  });

  router.post("/", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
      return;
    }
    try {
      const meeting = await ctx.orchestrator.createMeeting(parsed.data);
      res.status(201).json({ meeting });
    } catch (error) {
      log.error("create meeting failed", errorFields(error));
      res.status(502).json({ error: String(error) });
    }
  });

  router.get("/:id", async (req, res) => {
    const id = req.params.id!;
    const meeting = await ctx.store.getMeeting(id);
    if (!meeting) {
      res.status(404).json({ error: "meeting not found" });
      return;
    }
    const [utterances, chat, commands, approvals, audit, report] = await Promise.all([
      ctx.store.listUtterances(id),
      ctx.store.listChatMessages(id),
      ctx.store.listCommands(id),
      ctx.store.listApprovals(id),
      ctx.store.listAuditEvents(id),
      ctx.store.getReport(id),
    ]);
    res.json({ meeting, utterances, chat, commands, approvals, audit, report });
  });

  router.patch("/:id/modes", async (req, res) => {
    const parsed = modesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "modes must be booleans" });
      return;
    }
    try {
      res.json({ meeting: await ctx.orchestrator.setModes(req.params.id!, parsed.data) });
    } catch (error) {
      res.status(502).json({ error: String(error) });
    }
  });

  router.post("/:id/ask", async (req, res) => {
    const question = String((req.body as { question?: string }).question ?? "").trim();
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }
    try {
      const command = await ctx.orchestrator.askFromDashboard(req.params.id!, question);
      const approval = await pendingProposal(ctx.store, req.params.id!);
      res.json({ command, approval });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  router.post("/:id/leave", async (req, res) => {
    try {
      res.json({ meeting: await ctx.orchestrator.leave(req.params.id!) });
    } catch (error) {
      res.status(502).json({ error: String(error) });
    }
  });

  router.post("/:id/report", async (req, res) => {
    await ctx.orchestrator.buildReport(req.params.id!);
    res.json({ report: await ctx.store.getReport(req.params.id!) });
  });

  router.get("/:id/report.md", async (req, res) => {
    const report = await ctx.store.getReport(req.params.id!);
    if (!report) {
      res.status(404).json({ error: "no report yet" });
      return;
    }
    res.setHeader("content-type", "text/markdown; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="zeno-${req.params.id}.md"`);
    res.send(report.markdown);
  });

  // Confirming from the dashboard goes through exactly the same gate as the meeting.
  router.post("/:id/approvals/:approvalId/:decision", async (req, res) => {
    const { id, approvalId, decision } = req.params as Record<string, string>;
    const approval = await ctx.store.getApproval(approvalId!);
    if (!approval || approval.meetingId !== id) {
      res.status(404).json({ error: "approval not found" });
      return;
    }
    const live = await pendingProposal(ctx.store, id!);
    if (!live || live.id !== approval.id) {
      res.status(409).json({ error: "that proposal is no longer pending" });
      return;
    }
    if (decision === "cancel") {
      const cancelled = await cancelProposal(ctx.store, live, "Dashboard");
      ctx.bus.publish({ type: "approval", approval: cancelled });
      res.json({ approval: cancelled, applied: false });
      return;
    }
    const outcome = await applyProposal(ctx.store, ctx.provider, live, "Dashboard");
    ctx.bus.publish({ type: "approval", approval: outcome.approval });
    res.json({ approval: outcome.approval, applied: outcome.ok, message: outcome.message });
  });

  return router;
}
