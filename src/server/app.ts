import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppContext } from "./context.js";
import { demoRoutes } from "./routes/demo.js";
import { eventRoutes } from "./routes/events.js";
import { jiraRoutes } from "./routes/jira.js";
import { mediaRoutes } from "./routes/media.js";
import { meetingRoutes } from "./routes/meetings.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { errorFields, log } from "./lib/logger.js";

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");

  // Webhooks are mounted before the JSON parser: verification needs the raw body.
  app.use("/api/webhooks", webhookRoutes(ctx));

  app.use(express.json({ limit: "2mb" }));

  app.get("/healthz", async (_req, res) => {
    let database = "ok";
    try {
      await ctx.store.listMeetings(1);
    } catch (error) {
      database = `error: ${String(error)}`;
    }
    const healthy = database === "ok";
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      service: "zeno-meeting-intelligence",
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      recallRegion: ctx.env.RECALL_REGION,
      jiraProvider: ctx.provider.name,
      database,
    });
  });

  app.get("/api/config", (_req, res) => {
    // Names and non-secret settings only; no key material ever reaches the browser.
    res.json({
      recallRegion: ctx.env.RECALL_REGION,
      appBaseUrl: ctx.env.APP_BASE_URL,
      liveModel: ctx.env.LIVE_MODEL,
      reportModel: ctx.env.REPORT_MODEL,
      jiraProvider: ctx.provider.name,
    });
  });

  app.use("/api/meetings", meetingRoutes(ctx));
  app.use("/api/jira", jiraRoutes(ctx));
  app.use("/api/events", eventRoutes(ctx));
  app.use("/api/demo", demoRoutes(ctx));
  app.use(mediaRoutes(ctx));

  // Only ever the built bundle: src/web holds sources vite has not compiled yet.
  const webRoot = [resolve(process.cwd(), "dist/web"), resolve(here, "../web")]
    .filter((candidate) => !candidate.includes(`${sep}src${sep}`))
    .find((candidate) => existsSync(resolve(candidate, "index.html")));

  if (webRoot) {
    app.use(express.static(webRoot, { index: false }));
    app.get(/^(?!\/api|\/media|\/healthz).*/, (_req, res) => {
      res.sendFile(resolve(webRoot, "index.html"));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error("unhandled request error", errorFields(error));
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
