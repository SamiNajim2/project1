import { Router } from "express";
import type { AppContext } from "../context.js";
import { loadJiraSeed } from "../db/seedData.js";
import { recordAudit } from "../agent/approvals.js";

export function jiraRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json({ workspace: await ctx.provider.getWorkspace(), provider: ctx.provider.name });
  });

  router.get("/audit", async (_req, res) => {
    res.json({ events: await ctx.store.listAuditEvents(undefined, 200) });
  });

  /** Restores the demo board between takes. Recorded in the audit log like any change. */
  router.post("/reset", async (_req, res) => {
    await ctx.store.resetJira(loadJiraSeed());
    await recordAudit(ctx.store, {
      meetingId: null,
      actor: "Dashboard",
      action: "reset:workspace",
      issueKey: null,
      before: null,
      after: null,
      detail: "Mock Jira workspace reset to the seed data.",
    });
    res.json({ workspace: await ctx.provider.getWorkspace() });
  });

  return router;
}
