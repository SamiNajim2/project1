import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { analysisFingerprint, type Analysis } from "../analysis";
import { FORECAST_LABELS } from "../fields";
import { formatFigure } from "../format";
import { FORECAST_SCENARIOS, type Figure } from "../model";
import { checkNarrative, type NarrativeDoc, type NarrativeKind } from "../narrative/tokens";
import { periodLabel } from "../periods";
import { FALLBACK_BETA, MODEL, getClient } from "./anthropic";

const NarrativeSchema = z.object({
  sections: z.array(z.object({ heading: z.string(), paragraphs: z.array(z.string()), bullets: z.array(z.string()) })),
});

const SECTIONS: Record<NarrativeKind, string[]> = {
  investor_update: ["Headline", "Highlights", "Financial performance", "Cash and runway", "Recurring revenue", "Outlook"],
  board_pack: ["Performance summary", "KPIs", "Variance commentary", "Outlook", "Risks", "Actions for the board"],
};

const SYSTEM = `You are a senior FP&A analyst drafting finance narrative for a company's management. Every number in your draft must come from the verified figure catalog provided; the application substitutes the exact values.

Rules (strict):
- Refer to a figure only with its token, exactly as written in the catalog: {{F:<id>}}. The app replaces the token with the verified value.
- Never type a number yourself: no amounts, percentages, counts, multiples, growth rates or month counts. Years and month names ("June 2026") are allowed. If a sentence needs a number that is not in the catalog, leave the number out.
- Use only figures listed under VERIFIED. Figures listed under UNVERIFIED must not be used; you may say an item is "pending verification" without giving a value.
- Do not explain why something happened unless the reason is stated in the management commentary. If a variance has no stated reason, write that the driver is to be confirmed by management. Never invent causes, events, customers or plans.
- Keep actuals, forecasts and assumptions distinct: call forecast values forecasts, and name the scenario (base, upside, downside); call assumptions assumptions.
- Plain, precise business English. Short paragraphs. No marketing language, no filler.`;

/** The figures the draft may cite: headline KPIs and the key lines of every analysis, no raw rows. */
function catalog(a: Analysis): Figure[] {
  const ids = new Set<string>(a.kpis);
  const add = (f?: Figure) => f && ids.add(f.id);
  const keyLines = ["cat:revenue", "cat:cogs", "tot:gross_profit", "cat:opex", "tot:operating_result", "tot:net_result"];
  for (const t of [a.variance.month.budget, a.variance.month.prior, a.variance.ytd.budget]) {
    for (const l of t.lines) {
      if (keyLines.includes(l.key)) [l.actual, l.comparison, l.amount, l.pct].forEach(add);
    }
    // The three largest account-level variances, which commentary usually needs.
    [...t.lines]
      .filter((l) => l.level === "account" && l.amount.value !== null)
      .sort((x, y) => Math.abs(y.amount.value!) - Math.abs(x.amount.value!))
      .slice(0, 3)
      .forEach((l) => [l.actual, l.comparison, l.amount, l.pct].forEach(add));
  }
  for (const s of FORECAST_SCENARIOS) {
    const f = a.forecast[s];
    const last = f.months.at(-1);
    [last?.revenue, last?.operatingResult, last?.closingCash, a.runway[s].averageBurn, a.runway[s].runway, a.runway[s].projected, ...Object.values(f.assumptions)].forEach(add);
  }
  const rp = a.settings.reportingPeriod;
  const mrr = a.mrr.find((b) => b.period === rp);
  if (mrr) [mrr.starting, mrr.new, mrr.expansion, mrr.contraction, mrr.churn, mrr.ending, mrr.netNew, mrr.grr, mrr.nrr, mrr.arr].forEach(add);
  return [...ids].map((id) => a.figures[id]).filter(Boolean);
}

function catalogText(figures: Figure[], currency: string): string {
  const line = (f: Figure) => `{{F:${f.id}}} | ${f.label} | ${formatFigure(f, currency)} | ${f.kind}${f.verified ? "" : ` | reason: ${f.reasons[0]}`}`;
  const verified = figures.filter((f) => f.verified && f.value !== null);
  const unverified = figures.filter((f) => !f.verified);
  return `VERIFIED (you may cite these tokens):\n${verified.map(line).join("\n")}\n\nUNVERIFIED (do not cite):\n${unverified.map(line).join("\n") || "(none)"}`;
}

export async function draftNarrative(kind: NarrativeKind, analysis: Analysis, commentary: string): Promise<NarrativeDoc> {
  const s = analysis.settings;
  const figures = catalog(analysis);
  const checks = analysis.summary;
  const task =
    kind === "investor_update"
      ? `Write a monthly investor update for ${s.companyName} for ${periodLabel(s.reportingPeriod)}. Audience: existing investors. Sections, in this order: ${SECTIONS[kind].join(", ")}. The Headline section is one sentence in one paragraph. Highlights are 3–5 bullets. Keep it under 350 words.`
      : `Write the finance section of the board pack for ${s.companyName} for ${periodLabel(s.reportingPeriod)}. Audience: the board. Sections, in this order: ${SECTIONS[kind].join(", ")}. The application inserts the KPI, variance and forecast tables itself; your text comments on them. Risks: 3–5 bullets, each tied to a cited figure. Actions for the board: 2–4 bullets phrased as proposals for the board to consider, not decisions. Keep it under 500 words.`;

  const prompt = `<context>
Company: ${s.companyName}
Reporting month: ${periodLabel(s.reportingPeriod)}
Reporting currency: ${s.currency}
Forecast scenarios: ${FORECAST_SCENARIOS.map((x) => FORECAST_LABELS[x]).join(", ")} (${s.forecastMonths} months)
Reconciliation: ${checks.checksPassed} checks passed, ${checks.checksFailed} failed, ${checks.checksSkipped} skipped. Figures that failed are listed as UNVERIFIED.
</context>

<management_commentary>
${commentary.trim() || "(none provided — do not state any causes)"}
</management_commentary>

<figure_catalog>
${catalogText(figures, s.currency)}
</figure_catalog>

${task}`;

  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 16_000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(NarrativeSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("The model declined to draft this narrative.");
  if (message.stop_reason === "max_tokens") throw new Error("The draft was cut off. Try again.");
  const parsed = message.parsed_output;
  if (!parsed) throw new Error("The model returned the draft in an unexpected format. Try again.");

  return {
    kind,
    generatedAt: new Date().toISOString(),
    model: message.model,
    sections: parsed.sections,
    flags: checkNarrative(parsed.sections, analysis.figures, !!commentary.trim()),
    basis: analysisFingerprint(analysis),
  };
}

