import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  BusinessSchema,
  MarketSchema,
  PlanSchema,
  StrategySchema,
  SummarySchema,
  type ResearchPlan,
  type ResearchResult,
  type StrategyOutput,
} from "../schemas";
import type { PdfPayload, ProjectBrief, RecommendationEdit, StageEvent } from "../types";
import { FALLBACK_BETA, MODEL, StageError, getClient } from "./anthropic";
import { buildResearchResult, type ProvidedDocument } from "./evidence";
import {
  ANALYST_SYSTEM,
  BUSINESS_TASK,
  MARKET_TASK,
  PLAN_SYSTEM,
  RESEARCH_SYSTEM,
  STRATEGY_TASK,
  SUMMARY_TASK,
  formatBrief,
  formatBriefWithNotes,
  formatEvidence,
  formatPlan,
} from "./prompts";
import { enforceEvidence } from "./validate";

type Emit = (event: StageEvent) => void;
type Effort = "low" | "medium" | "high";

export interface StageResult<T> {
  data: T;
  model: string;
}

// The research request must finish inside the 300s function limit. Past the soft deadline no new
// continuation starts; at the hard deadline the stream is stopped and the findings written so far are kept.
const RESEARCH_SOFT_DEADLINE_MS = 150_000;
const RESEARCH_HARD_DEADLINE_MS = 245_000;
const MAX_RESEARCH_CONTINUATIONS = 4;

function checkStop(message: Anthropic.Beta.BetaMessage) {
  if (message.stop_reason === "refusal") {
    throw new StageError("The model declined this request. Rephrase the brief and try again.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new StageError("The response was cut off because it was too long. Retry this step.");
  }
}

// ---------------- Plan ----------------

export async function runPlan(brief: ProjectBrief, emit: Emit, signal: AbortSignal): Promise<StageResult<ResearchPlan>> {
  emit({ type: "progress", message: "Framing the decision and planning the research…" });
  return runStructured({
    schema: PlanSchema,
    system: PLAN_SYSTEM,
    context: formatBrief(brief),
    task: "Create the research plan for this brief.",
    effort: "low",
    emit,
    signal,
  });
}

// ---------------- Research ----------------

export async function runResearch(
  input: { brief: ProjectBrief; plan: ResearchPlan; pdfs: PdfPayload[] },
  emit: Emit,
  signal: AbortSignal,
): Promise<StageResult<ResearchResult>> {
  const client = getClient();
  const { brief, plan, pdfs } = input;

  const documents: ProvidedDocument[] = [];
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const pdf of pdfs) {
    documents.push({ title: pdf.name, kind: "pdf" });
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
      title: pdf.name,
      citations: { enabled: true },
    });
  }
  if (brief.notes.trim()) {
    documents.push({ title: "User notes", kind: "notes" });
    content.push({
      type: "document",
      source: { type: "text", media_type: "text/plain", data: brief.notes.trim() },
      title: "User notes",
      citations: { enabled: true },
    });
  }
  content.push({
    type: "text",
    text: `${formatBrief(brief)}\n\n${formatPlan(plan)}\n\nResearch this brief now. ${
      brief.sourceUrls.length ? "Start by fetching the user-provided URLs. " : ""
    }${documents.length ? "Use the attached documents as evidence where relevant. " : ""}Then search the web for each workstream.`,
  });

  // Direct calls only. When these tools run inside code execution (dynamic filtering), their results
  // are not citable and the model attributes web facts to whatever document is citable instead.
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6, allowed_callers: ["direct"] },
    {
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_uses: Math.min(2 + brief.sourceUrls.length, 6),
      citations: { enabled: true },
      max_content_tokens: 30_000,
      allowed_callers: ["direct"],
    },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  const blocks: Anthropic.Beta.BetaContentBlock[] = [];
  const started = Date.now();
  let model = MODEL;
  let sourcesAnnounced = 0;
  let hitHardDeadline = false;

  emit({ type: "progress", message: "Starting web research…" });

  for (let turn = 0; ; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 32_000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: RESEARCH_SYSTEM,
        tools,
        messages,
      },
      { signal },
    );

    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use") {
        const input = block.input as { query?: unknown; url?: unknown };
        if (block.name === "web_search" && typeof input.query === "string") emit({ type: "search", query: input.query });
        if (block.name === "web_fetch" && typeof input.url === "string") emit({ type: "fetch", url: input.url });
      }
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content.slice(0, 4)) {
          if (sourcesAnnounced++ < 40) emit({ type: "source", title: r.title, url: r.url });
        }
      }
    });

    const timer = setTimeout(() => stream.abort(), Math.max(1_000, RESEARCH_HARD_DEADLINE_MS - (Date.now() - started)));
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      if (!stream.aborted || signal.aborted) throw error;
      hitHardDeadline = true;
      blocks.push(...(stream.currentMessage?.content ?? []));
      emit({ type: "progress", message: "Research time limit reached; keeping the findings written so far." });
      break;
    } finally {
      clearTimeout(timer);
    }
    model = message.model;
    blocks.push(...message.content);

    if (message.stop_reason === "pause_turn") {
      const elapsed = Date.now() - started;
      if (turn + 1 >= MAX_RESEARCH_CONTINUATIONS || elapsed > RESEARCH_SOFT_DEADLINE_MS) {
        emit({ type: "progress", message: "Research time budget reached; continuing with the evidence gathered so far." });
        break;
      }
      messages.push({ role: "assistant", content: message.content });
      emit({ type: "progress", message: "Continuing research…" });
      continue;
    }
    checkStop(message);
    break;
  }

  emit({ type: "progress", message: "Checking citations and building the evidence base…" });
  const result = buildResearchResult(blocks, documents, brief.sourceUrls);
  if (result.evidence.length === 0) {
    throw new StageError(
      hitHardDeadline
        ? "The research ran out of time before writing its findings. Retry this step, or narrow the business question."
        : "The research did not return any cited evidence. Check the company name and website, add source URLs or notes, and retry.",
    );
  }
  emit({
    type: "progress",
    message: `Found ${result.evidence.length} cited findings from ${result.sources.filter((s) => s.cited).length} sources.`,
  });
  return { data: result, model };
}

// ---------------- Analysis stages ----------------

interface AnalysisInput {
  brief: ProjectBrief;
  plan: ResearchPlan;
  research: ResearchResult;
}

function analysisContext({ brief, plan, research }: AnalysisInput): string {
  return `${formatBriefWithNotes(brief)}\n\n${formatPlan(plan)}\n\n${formatEvidence(research)}`;
}

function evidenceIdSet(research: ResearchResult): Set<string> {
  return new Set(research.evidence.map((e) => e.id));
}

export async function runMarket(input: AnalysisInput, emit: Emit, signal: AbortSignal) {
  emit({ type: "progress", message: `Analysing ${input.research.evidence.length} findings: market, competitors and segments…` });
  const result = await runStructured({
    schema: MarketSchema,
    system: ANALYST_SYSTEM,
    context: analysisContext(input),
    task: MARKET_TASK,
    effort: "medium",
    emit,
    signal,
  });
  return { ...result, data: enforceEvidence(result.data, evidenceIdSet(input.research)) };
}

export async function runStrategy(
  input: AnalysisInput & { market: unknown },
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: "progress", message: "Developing three strategic options…" });
  const result = await runStructured({
    schema: StrategySchema,
    system: ANALYST_SYSTEM,
    context: analysisContext(input),
    task: `<market_analysis>\n${JSON.stringify(input.market)}\n</market_analysis>\n\n${STRATEGY_TASK}`,
    effort: "high",
    emit,
    signal,
  });
  const data = enforceEvidence(result.data, evidenceIdSet(input.research));
  const options = normalizeOptions(data.options);
  if (options.length < 3) throw new StageError("The model returned fewer than three options. Retry this step.");
  const optionId = options.some((o) => o.id === data.recommendation.optionId) ? data.recommendation.optionId : options[0].id;
  return { ...result, data: { ...data, options, recommendation: { ...data.recommendation, optionId } } };
}

function normalizeOptions<T extends { id: string }>(options: T[]): T[] {
  const ids = ["A", "B", "C"] as const;
  return options.slice(0, 3).map((o, i) => ({ ...o, id: ids[i] }));
}

export async function runBusiness(
  input: AnalysisInput & { strategy: StrategyOutput; recommendationEdit?: RecommendationEdit },
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: "progress", message: "Building the business case and 90-day plan…" });
  const result = await runStructured({
    schema: BusinessSchema,
    system: ANALYST_SYSTEM,
    context: analysisContext(input),
    task: `${formatRecommendation(input.strategy, input.recommendationEdit)}\n\n${BUSINESS_TASK}`,
    effort: "medium",
    emit,
    signal,
  });
  return { ...result, data: enforceEvidence(result.data, evidenceIdSet(input.research)) };
}

export async function runSummary(
  input: AnalysisInput & {
    market: unknown;
    strategy: StrategyOutput;
    business: unknown;
    recommendationEdit?: RecommendationEdit;
  },
  emit: Emit,
  signal: AbortSignal,
) {
  emit({ type: "progress", message: "Writing the executive summary and presentation outline…" });
  const result = await runStructured({
    schema: SummarySchema,
    system: ANALYST_SYSTEM,
    context: analysisContext(input),
    task: `<market_analysis>\n${JSON.stringify(input.market)}\n</market_analysis>\n\n${formatRecommendation(
      input.strategy,
      input.recommendationEdit,
    )}\n\n<business_case_and_plan>\n${JSON.stringify(input.business)}\n</business_case_and_plan>\n\n${SUMMARY_TASK}`,
    effort: "medium",
    emit,
    signal,
  });
  return { ...result, data: enforceEvidence(result.data, evidenceIdSet(input.research)) };
}

function formatRecommendation(strategy: StrategyOutput, edit?: RecommendationEdit): string {
  const options = JSON.stringify(strategy.options);
  if (edit) {
    return `<strategic_options>\n${options}\n</strategic_options>\n\n<recommendation source="edited by the user — treat as the final decision">
Chosen option: ${edit.optionId}
Headline: ${edit.headline}
Rationale: ${edit.rationale}
</recommendation>`;
  }
  return `<strategic_options>\n${options}\n</strategic_options>\n\n<recommendation>\n${JSON.stringify(strategy.recommendation)}\n</recommendation>`;
}

// ---------------- Shared structured-output runner ----------------

async function runStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  context: string;
  task: string;
  effort: Effort;
  emit: Emit;
  signal: AbortSignal;
}): Promise<StageResult<z.infer<S>>> {
  const client = getClient();
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64_000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            // The brief, plan and evidence are identical across the analysis stages, so they are cached.
            { type: "text", text: opts.context, cache_control: { type: "ephemeral" } },
            { type: "text", text: opts.task },
          ],
        },
      ],
    },
    { signal: opts.signal },
  );

  let chars = 0;
  let lastReport = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    const now = Date.now();
    if (now - lastReport > 2500) {
      lastReport = now;
      opts.emit({ type: "progress", message: `Writing… ${Math.round(chars / 1000)}k characters so far` });
    }
  });

  const message = await stream.finalMessage();
  checkStop(message);

  let parsed: unknown = message.parsed_output;
  if (parsed == null) {
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const result = opts.schema.safeParse(safeJson(text));
    if (!result.success) throw new StageError("The model returned output in an unexpected format. Retry this step.");
    parsed = result.data;
  }
  return { data: parsed as z.infer<S>, model: message.model };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
