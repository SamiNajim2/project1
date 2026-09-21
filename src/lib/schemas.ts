import { z } from "zod";

/**
 * How a statement is supported.
 * - sourced: backed by one or more evidence items from the research stage
 * - estimate: a derived or approximate figure, not directly stated by a source
 * - assumption: an input the user should validate
 * - judgment: analysis or opinion, contains no factual claim
 * - gap: the information needed is missing ("More evidence needed")
 * - unverified: set by the server when a claim presented as fact has no valid evidence
 */
export const BASIS_VALUES = ["sourced", "estimate", "assumption", "judgment", "gap"] as const;
export type ModelBasis = (typeof BASIS_VALUES)[number];
export type Basis = ModelBasis | "unverified";

export const ClaimSchema = z.object({
  text: z.string().describe("One concise statement."),
  basis: z.enum(BASIS_VALUES),
  evidenceIds: z
    .array(z.string())
    .describe('Evidence IDs such as "E4" that directly support the statement. Empty unless basis is sourced or the figure is derived from evidence.'),
});
export type Claim = Omit<z.infer<typeof ClaimSchema>, "basis"> & { basis: Basis };

// ---------- Stage: plan ----------

export const PlanSchema = z.object({
  objective: z.string().describe("The business question restated as a decision to be made."),
  keyQuestions: z.array(z.string()),
  workstreams: z.array(
    z.object({
      name: z.string(),
      focus: z.string(),
      questions: z.array(z.string()),
    }),
  ),
  searchQueries: z.array(z.string()),
  evidenceNeeded: z.array(z.string()),
});
export type ResearchPlan = z.infer<typeof PlanSchema>;

// ---------- Stage: research (assembled by the server, not model-structured) ----------

export type SourceKind = "web" | "user_url" | "pdf" | "notes";

export interface Source {
  id: string;
  title: string;
  url: string | null;
  kind: SourceKind;
  pageAge: string | null;
  cited: boolean;
}

export interface EvidenceQuote {
  sourceId: string;
  quote: string;
  location: string | null;
}

export interface Evidence {
  id: string;
  topic: string;
  text: string;
  sourceIds: string[];
  quotes: EvidenceQuote[];
}

export interface ResearchResult {
  evidence: Evidence[];
  sources: Source[];
  gaps: string[];
  searches: string[];
  completedAt: string;
}

// ---------- Stage: market ----------

export const MarketSchema = z.object({
  marketOverview: z.object({
    summary: z.array(ClaimSchema),
    keyMetrics: z.array(z.object({ label: z.string(), value: ClaimSchema })),
    trends: z.array(ClaimSchema),
    evidenceGaps: z.array(z.string()),
  }),
  competitors: z.object({
    rows: z.array(
      z.object({
        name: z.string(),
        website: z.string().nullable(),
        isSubject: z.boolean().describe("True only for the company this project is about."),
        positioning: ClaimSchema,
        targetCustomers: ClaimSchema,
        offering: ClaimSchema,
        pricing: ClaimSchema,
        strengths: ClaimSchema,
        weaknesses: ClaimSchema,
      }),
    ),
    takeaways: z.array(ClaimSchema),
    evidenceGaps: z.array(z.string()),
  }),
  segments: z.object({
    items: z.array(
      z.object({
        name: z.string(),
        description: ClaimSchema,
        needs: z.array(ClaimSchema),
        sizeIndicator: ClaimSchema,
        attractiveness: z.enum(["high", "medium", "low"]),
        rationale: ClaimSchema,
      }),
    ),
    evidenceGaps: z.array(z.string()),
  }),
});

// ---------- Stage: strategy ----------

export const OPTION_IDS = ["A", "B", "C"] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export const StrategySchema = z.object({
  options: z.array(
    z.object({
      id: z.enum(OPTION_IDS),
      title: z.string(),
      summary: z.string(),
      benefits: z.array(ClaimSchema),
      risks: z.array(ClaimSchema),
      requirements: z.array(ClaimSchema),
    }),
  ),
  recommendation: z.object({
    optionId: z.enum(OPTION_IDS),
    headline: z.string(),
    rationale: z.array(ClaimSchema),
    whyNotOthers: z.array(ClaimSchema),
    conditionsToRevisit: z.array(ClaimSchema),
  }),
});

// ---------- Stage: business ----------

const SupportBasis = z.enum(["sourced", "estimate", "assumption"]);

export const BusinessSchema = z.object({
  businessCase: z.object({
    summary: z.string(),
    currency: z.string().describe('ISO currency code, e.g. "USD".'),
    assumptions: z.array(
      z.object({
        id: z.string().describe('"A1", "A2", ...'),
        label: z.string(),
        value: z.string(),
        basis: SupportBasis,
        evidenceIds: z.array(z.string()),
        rationale: z.string(),
      }),
    ),
    projections: z.array(
      z.object({
        metric: z.string(),
        conservative: z.string(),
        base: z.string(),
        upside: z.string(),
        derivation: z.string().describe("How the figures follow from the assumption IDs."),
      }),
    ),
    investment: z.array(
      z.object({
        item: z.string(),
        amount: z.string(),
        assumptionIds: z.array(z.string()),
      }),
    ),
    risksToCase: z.array(ClaimSchema),
    evidenceGaps: z.array(z.string()),
  }),
  ninetyDayPlan: z.object({
    phases: z.array(
      z.object({
        name: z.string(),
        goal: z.string(),
        actions: z.array(z.object({ action: z.string(), owner: z.string(), deliverable: z.string() })),
      }),
    ),
    kpis: z.array(z.object({ metric: z.string(), target: z.string(), basis: SupportBasis })),
    decisionPoints: z.array(z.string()),
  }),
});

// ---------- Stage: summary ----------

export const SummarySchema = z.object({
  executiveSummary: z.object({
    headline: z.string(),
    situation: z.array(ClaimSchema),
    recommendation: z.string(),
    nextSteps: z.array(z.string()),
  }),
  presentationOutline: z.object({
    title: z.string(),
    slides: z.array(
      z.object({
        title: z.string(),
        keyMessage: z.string(),
        bullets: z.array(z.string()),
        visual: z.string().describe("Suggested chart, table or diagram for the slide."),
        evidenceIds: z.array(z.string()),
      }),
    ),
  }),
});

// Output types use Claim (which admits "unverified") after server validation.
type WithClaims<T> = T extends { basis: ModelBasis; evidenceIds: string[]; text: string }
  ? Claim
  : T extends Array<infer U>
    ? WithClaims<U>[]
    : T extends object
      ? { [K in keyof T]: WithClaims<T[K]> }
      : T;

export type MarketOutput = WithClaims<z.infer<typeof MarketSchema>>;
export type StrategyOutput = WithClaims<z.infer<typeof StrategySchema>>;
export type BusinessOutput = WithClaims<z.infer<typeof BusinessSchema>>;
export type SummaryOutput = WithClaims<z.infer<typeof SummarySchema>>;
export type StrategicOption = StrategyOutput["options"][number];
