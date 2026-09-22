import { Router } from "express";
import type { AppContext } from "../context.js";

/** Server-sent events powering the live dashboard. */
export function eventRoutes(ctx: AppContext): Router {
  const router = Router();

  router.get("/", (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    send({ type: "ping" });

    const unsubscribe = ctx.bus.subscribe(send);
    const heartbeat = setInterval(() => send({ type: "ping" }), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
