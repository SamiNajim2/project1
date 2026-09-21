import type {
  BusinessOutput,
  MarketOutput,
  OptionId,
  ResearchPlan,
  ResearchResult,
  StrategyOutput,
  SummaryOutput,
} from "./schemas";

export const STAGES = [
  { id: "plan", label: "Research plan", description: "Frame the decision and plan the research" },
  { id: "research", label: "Market research", description: "Search the web and review your sources" },
  { id: "market", label: "Market, competitors & segments", description: "Analyse the evidence" },
  { id: "strategy", label: "Options & recommendation", description: "Develop three options and pick one" },
  { id: "business", label: "Business case & 90-day plan", description: "Size the opportunity and plan execution" },
  { id: "summary", label: "Executive summary & outline", description: "Write the summary and presentation" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

export interface UploadedFileMeta {
  id: string;
  name: string;
  size: number;
}

export interface ProjectBrief {
  companyName: string;
  website: string;
  objective: string;
  targetMarket: string;
  geography: string;
  constraints: string;
  notes: string;
  sourceUrls: string[];
  files: UploadedFileMeta[];
}

export interface StageOutputs {
  plan?: ResearchPlan;
  research?: ResearchResult;
  market?: MarketOutput;
  strategy?: StrategyOutput;
  business?: BusinessOutput;
  summary?: SummaryOutput;
}

export type StageStatus = "pending" | "running" | "done" | "error";

export interface StageState {
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface RecommendationEdit {
  optionId: OptionId;
  headline: string;
  rationale: string;
  editedAt: string;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
  brief: ProjectBrief;
  stages: Partial<Record<StageId, StageState>>;
  outputs: StageOutputs;
  /** User's edited recommendation. When present it overrides the AI recommendation everywhere. */
  recommendationEdit?: RecommendationEdit;
  /** True when the recommendation was edited after the business case and summary were written. */
  downstreamStale?: boolean;
  model?: string;
}

/** A PDF sent to the server for the research stage. */
export interface PdfPayload {
  name: string;
  base64: string;
}

/** Lines streamed back from /api/stages/[stage] as NDJSON. */
export type StageEvent =
  | { type: "progress"; message: string }
  | { type: "search"; query: string }
  | { type: "fetch"; url: string }
  | { type: "source"; title: string; url: string }
  | { type: "result"; data: unknown; model: string }
  | { type: "error"; message: string };
