import "server-only";
import type { ResearchPlan, ResearchResult } from "../schemas";
import type { ProjectBrief } from "../types";

export const PLAN_SYSTEM = `You are Strategy Agent, a senior strategy consultant. You write short, practical research plans that a researcher with web search can execute in a few minutes.

Keep the plan tight: 3–5 workstreams that together answer the business question (typically market size and dynamics, competitors, customers and segments, and anything specific to the question such as regulation or channels). 4–8 web search queries that are specific enough to find primary sources, including geography and year where useful. List the evidence the analysis will need.

Keep outputs reasonably concise.`;

export const RESEARCH_SYSTEM = `You are the research analyst for Strategy Agent. You gather trustworthy evidence for a strategy project using web search, web fetch and the documents the user provided.

How to work:
- Follow the research plan. Prefer primary and authoritative sources: company websites and investor materials, statistics agencies and regulators, industry associations, reputable research firms and business press.
- Fetch every user-provided URL with web_fetch before searching.
- Read the attached documents and user notes; they are trusted inputs from the user. Record their decision-relevant facts as findings under the matching workstream, cited to the document.
- Look for concrete, decision-relevant facts: market size and growth (with year and geography), customer needs and behaviour, competitor offerings, pricing and positioning, recent moves, regulation and channels.
- Work efficiently: you have a small search budget. Prefer searches likely to surface primary sources, and stop searching once each workstream has usable evidence or you have confirmed it is not publicly available.

How to write your findings:
- Organise findings under "## <workstream name>" headings.
- Write each finding as one short factual sentence on its own line starting with "- ", and cite it. Include the number, unit, year and geography when there is one.
- Only write facts that your sources state. Never write facts, numbers or company details from memory. If sources disagree, report each with its citation.
- Do not write an introduction, a conclusion, commentary or recommendations.
- Finish with a "## Evidence gaps" heading listing, one per line starting with "- ", the important questions the sources did not answer.`;

export const ANALYST_SYSTEM = `You are Strategy Agent, a senior strategy consultant. You turn a company brief and a fixed body of research evidence into a rigorous strategy project for a business user.

Evidence rules (strict):
- The only facts you may use are those in the <evidence> block and the user's <brief>. Do not use outside knowledge for facts, figures, company details, prices, market sizes, dates or quotes.
- Every statement that asserts a fact has basis "sourced" and lists the evidence IDs (for example "E3") that directly support it. Cite only IDs that appear in the <evidence> block. The server discards any other ID and marks the statement unverified.
- Never invent a source, fact or number. A number that the evidence does not state is labeled: basis "estimate" when you derived it (say briefly how in the text), or basis "assumption" when it is an input the user must validate.
- Analysis, interpretation and recommendations have basis "judgment" and contain no unsupported facts or numbers.
- When the evidence is insufficient for something the task asks for, say so plainly: basis "gap", with text that begins "More evidence needed:" and names what is missing. Do not fill gaps with guesses.
- The user's constraints in the <brief> and the <user_notes> are valid inputs that shape the options and recommendation. When you state a fact from the notes, cite the evidence ID if the notes appear in the evidence; otherwise treat it as an assumption.

Writing: specific, plain business English. One idea per statement. No filler, no boilerplate caveats. Match the length of each section to what the decision needs.

Keep outputs reasonably concise.`;

export function formatBrief(brief: ProjectBrief): string {
  const lines = [
    `Company: ${brief.companyName}`,
    `Website: ${brief.website || "not provided"}`,
    `Business question / objective: ${brief.objective}`,
    `Target market: ${brief.targetMarket || "not specified"}`,
    `Geography: ${brief.geography || "not specified"}`,
    `Constraints: ${brief.constraints || "none stated"}`,
  ];
  if (brief.sourceUrls.length) lines.push(`User-provided source URLs:\n${brief.sourceUrls.map((u) => `- ${u}`).join("\n")}`);
  if (brief.files.length) lines.push(`User-provided documents: ${brief.files.map((f) => f.name).join(", ")}`);
  return `<brief>\n${lines.join("\n")}\n</brief>`;
}

/** The brief plus the user's notes, for the analysis stages (research receives the notes as a citable document). */
export function formatBriefWithNotes(brief: ProjectBrief): string {
  const notes = brief.notes.trim();
  return notes ? `${formatBrief(brief)}\n\n<user_notes>\n${notes}\n</user_notes>` : formatBrief(brief);
}

export function formatPlan(plan: ResearchPlan): string {
  const workstreams = plan.workstreams
    .map((w) => `### ${w.name}\nFocus: ${w.focus}\n${w.questions.map((q) => `- ${q}`).join("\n")}`)
    .join("\n\n");
  return `<research_plan>
Objective: ${plan.objective}

Key questions:
${plan.keyQuestions.map((q) => `- ${q}`).join("\n")}

Workstreams:
${workstreams}

Suggested searches:
${plan.searchQueries.map((q) => `- ${q}`).join("\n")}
</research_plan>`;
}

export function formatEvidence(research: ResearchResult): string {
  const sourceById = new Map(research.sources.map((s) => [s.id, s]));
  const byTopic = new Map<string, string[]>();
  for (const e of research.evidence) {
    const sources = e.sourceIds
      .map((id) => sourceById.get(id))
      .filter((s) => s !== undefined)
      .map((s) => `${s.id} "${s.title}"${s.url ? ` <${s.url}>` : ""}`)
      .join("; ");
    const quote = e.quotes[0]?.quote ? `\n  Quote: "${truncate(e.quotes[0].quote, 280)}"` : "";
    const entry = `[${e.id}] ${e.text}\n  Sources: ${sources}${quote}`;
    byTopic.set(e.topic, [...(byTopic.get(e.topic) ?? []), entry]);
  }
  const body = [...byTopic.entries()].map(([topic, entries]) => `## ${topic}\n${entries.join("\n")}`).join("\n\n");
  const gaps = research.gaps.length
    ? `\n\n<evidence_gaps>\n${research.gaps.map((g) => `- ${g}`).join("\n")}\n</evidence_gaps>`
    : "";
  return `<evidence>\n${body || "No evidence was found."}\n</evidence>${gaps}`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export const MARKET_TASK = `Task: using only the evidence, write the market analysis.

1. marketOverview: 3–6 summary claims on market size, growth and dynamics relevant to the business question; up to 6 keyMetrics (a short label plus a claim holding the value); 3–6 trends; evidenceGaps listing what is missing.
2. competitors: 3–6 rows. Put the subject company first with isSubject true, then its most relevant competitors named in the evidence. Every cell is one short claim; when something is not in the evidence, use basis "gap" with "More evidence needed: …". Never guess pricing. Then 2–4 takeaways.
3. segments: 3–5 customer segments that matter for the business question. sizeIndicator is sourced, an estimate that states its derivation, or a gap. Rate attractiveness and justify it in rationale.`;

export const STRATEGY_TASK = `Task: develop exactly three strategic options (ids "A", "B", "C") that answer the business question within the constraints, then recommend one.

Options must differ in strategic logic (where to play and how to win), not just in intensity or budget. For each option give a one-paragraph summary plus benefits, risks and requirements (capabilities, investment, partners, time) as claims.

Recommendation: optionId, a one-sentence headline that states the decision, rationale claims explaining why this option best fits the evidence and constraints, one whyNotOthers claim per rejected option, and conditionsToRevisit — the signals that would change the recommendation.`;

export const BUSINESS_TASK = `Task: build a simple business case and a 90-day action plan for the recommended option in <recommendation>.

Business case:
- List assumptions first with ids "A1", "A2", …. Every number used anywhere in the case must come from an assumption. Each assumption's basis is "sourced" (the value is stated in the evidence; cite it), "estimate" (derived; explain in rationale) or "assumption" (the user must validate it).
- projections: 3–5 metrics with conservative, base and upside values and a derivation that references assumption IDs. Keep the arithmetic consistent with the assumptions.
- investment: the main cost items, each referencing assumption IDs.
- risksToCase: claims. evidenceGaps: the missing evidence that would most improve the case.

90-day plan: three phases named "Days 1–30", "Days 31–60" and "Days 61–90", each with a goal and 3–5 actions (action, owner role, deliverable). kpis with targets and their basis. decisionPoints: the go/no-go decisions and when they happen.`;

export const SUMMARY_TASK = `Task: write the executive summary and a consulting-style presentation outline for the recommended option in <recommendation>.

executiveSummary: headline (the answer in one sentence), situation (3–5 claims), recommendation (2–3 sentences), nextSteps (3–5 short items).

presentationOutline: a title and 9–12 slides in a pyramid storyline — executive summary, situation, market, competitors, customer segments, strategic options, recommendation, business case, 90-day plan, risks, next steps. Each slide has an action title that states the takeaway, a keyMessage, 2–4 bullets, a suggested visual and the evidenceIds supporting it. Bullets follow the evidence rules; mark estimates "(estimate)" and assumptions "(assumption)" in the bullet text.`;
