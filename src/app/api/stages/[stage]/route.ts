import { z } from "zod";
import { MissingKeyError, describeError } from "@/lib/server/anthropic";
import { hasActiveSubscription } from "@/lib/server/billing";
import { ndjsonResponse } from "@/lib/server/ndjson";
import { runBusiness, runMarket, runPlan, runResearch, runStrategy, runSummary } from "@/lib/server/stages";
import type { ResearchPlan, ResearchResult, StrategyOutput } from "@/lib/schemas";
import { getSessionUser } from "@/lib/supabase/server";
import { STAGE_IDS, type StageId } from "@/lib/types";

export const maxDuration = 300;

const MAX_PDF_BYTES_TOTAL = 20 * 1024 * 1024;

const BriefSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  website: z.string().trim().max(500),
  objective: z.string().trim().min(10, "Describe the business question in a sentence or two").max(4000),
  targetMarket: z.string().trim().max(1000),
  geography: z.string().trim().max(500),
  constraints: z.string().trim().max(4000),
  notes: z.string().max(60_000),
  sourceUrls: z.array(z.string().url().max(2000)).max(15),
  files: z.array(z.object({ id: z.string(), name: z.string(), size: z.number() })).max(10),
});

// Earlier stage outputs are produced by this server and round-tripped through the browser.
// Their evidence IDs are re-checked against the research evidence on every stage.
const Passthrough = z.custom<unknown>((v) => v !== null && typeof v === "object", "Missing earlier stage output");
const ResearchInput = z.custom<ResearchResult>(
  (v) => !!v && typeof v === "object" && Array.isArray((v as ResearchResult).evidence) && Array.isArray((v as ResearchResult).sources),
  "Missing research results",
);
const RecommendationEditSchema = z
  .object({ optionId: z.enum(["A", "B", "C"]), headline: z.string().max(1000), rationale: z.string().max(10_000), editedAt: z.string() })
  .optional();

const base = { brief: BriefSchema, plan: z.custom<ResearchPlan>((v) => !!v && typeof v === "object", "Missing research plan") };

const RequestSchemas = {
  plan: z.object({ brief: BriefSchema }),
  research: z.object({
    ...base,
    pdfs: z
      .array(z.object({ name: z.string().max(300), base64: z.string() }))
      .max(10)
      .refine((pdfs) => pdfs.reduce((n, p) => n + p.base64.length * 0.75, 0) <= MAX_PDF_BYTES_TOTAL, "PDFs exceed 20 MB in total"),
  }),
  market: z.object({ ...base, research: ResearchInput }),
  strategy: z.object({ ...base, research: ResearchInput, market: Passthrough }),
  business: z.object({
    ...base,
    research: ResearchInput,
    strategy: z.custom<StrategyOutput>((v) => !!v && typeof v === "object", "Missing strategy"),
    recommendationEdit: RecommendationEditSchema,
  }),
  summary: z.object({
    ...base,
    research: ResearchInput,
    market: Passthrough,
    strategy: z.custom<StrategyOutput>((v) => !!v && typeof v === "object", "Missing strategy"),
    business: Passthrough,
    recommendationEdit: RecommendationEditSchema,
  }),
} satisfies Record<StageId, z.ZodType>;

export async function POST(request: Request, { params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  if (!STAGE_IDS.includes(stage as StageId)) {
    return Response.json({ error: `Unknown stage "${stage}"` }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: describeError(new MissingKeyError()) }, { status: 500 });
  }

  // Every analysis spends API credit, so only signed-in subscribers may run one.
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Your session has ended. Sign in again to run the analysis." }, { status: 401 });
  if (!(await hasActiveSubscription(user.id))) {
    return Response.json({ error: "An active Strategy Agent Pro subscription is required. Subscribe on the Billing page." }, { status: 402 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const id = stage as StageId;
  const parsed = RequestSchemas[id].safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json({ error: `${issue.path.join(".") || "request"}: ${issue.message}` }, { status: 400 });
  }

  return ndjsonResponse(request, async (emit, signal) => {
    const result = await dispatch(id, parsed.data, emit, signal);
    emit({ type: "result", data: result.data, model: result.model });
  });
}

type Emit = Parameters<Parameters<typeof ndjsonResponse>[1]>[0];

function dispatch(stage: StageId, input: unknown, emit: Emit, signal: AbortSignal): Promise<{ data: unknown; model: string }> {
  switch (stage) {
    case "plan":
      return runPlan((input as z.infer<typeof RequestSchemas.plan>).brief, emit, signal);
    case "research":
      return runResearch(input as z.infer<typeof RequestSchemas.research>, emit, signal);
    case "market":
      return runMarket(input as z.infer<typeof RequestSchemas.market>, emit, signal);
    case "strategy":
      return runStrategy(input as z.infer<typeof RequestSchemas.strategy>, emit, signal);
    case "business":
      return runBusiness(input as z.infer<typeof RequestSchemas.business>, emit, signal);
    case "summary":
      return runSummary(input as z.infer<typeof RequestSchemas.summary>, emit, signal);
  }
}
