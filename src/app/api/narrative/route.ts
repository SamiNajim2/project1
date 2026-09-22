import { z } from "zod";
import { runAnalysis } from "@/lib/analysis";
import type { AnalysisInput } from "@/lib/model";
import { describeError } from "@/lib/server/anthropic";
import { hasActiveSubscription } from "@/lib/server/billing";
import { getSessionUser } from "@/lib/supabase/server";
import { draftNarrative } from "@/lib/server/narrative";

export const maxDuration = 120;

const Body = z.object({
  kind: z.enum(["investor_update", "board_pack"]),
  commentary: z.string().max(10_000),
  input: z.custom<AnalysisInput>(
    (v) =>
      !!v &&
      typeof v === "object" &&
      ["pnl", "cash", "mrr", "issues"].every((k) => Array.isArray((v as Record<string, unknown>)[k])) &&
      typeof (v as AnalysisInput).settings?.reportingPeriod === "string",
    "Invalid analysis input",
  ),
});

/**
 * Drafts narrative text. The server re-runs the deterministic analysis itself, so the model only ever
 * sees figures computed and reconciled by the same TypeScript functions the app uses.
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });

  // Drafting spends API credit, so only signed-in subscribers may use it.
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Your session has ended. Sign in again to draft." }, { status: 401 });
  if (!(await hasActiveSubscription(user.id))) {
    return Response.json({ error: "An active Finance Analyst Pro subscription is required. Subscribe on the Billing page." }, { status: 402 });
  }
  let body: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (body.input.pnl.length > 50_000) return Response.json({ error: "Too much data for one request." }, { status: 413 });

  try {
    const analysis = runAnalysis(body.input);
    if (!analysis.kpis.some((id) => analysis.figures[id]?.verified)) {
      return Response.json({ error: "There are no verified figures to write about yet. Resolve the data-quality errors first." }, { status: 422 });
    }
    const doc = await draftNarrative(body.kind, analysis, body.commentary);
    return Response.json(doc);
  } catch (error) {
    console.error("[narrative] failed:", error);
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}
