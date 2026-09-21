import type { Claim } from "./schemas";
import type { Project } from "./types";
import { BASIS_LABEL, buildCitationIndex, effectiveRecommendation, sourcesFor, type CitationIndex } from "./report";

const MORE_EVIDENCE = "_More evidence needed._";

function esc(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function cite(evidenceIds: string[], index: CitationIndex): string {
  const refs = sourcesFor(evidenceIds, index).map((s) => {
    const n = index.numbers.get(s.id);
    return s.url ? `[[${n}]](${s.url})` : `[${n}]`;
  });
  return refs.length ? ` ${refs.join("")}` : "";
}

function claim(c: Claim, index: CitationIndex): string {
  const label = BASIS_LABEL[c.basis];
  const text = c.basis === "gap" && !/^more evidence needed/i.test(c.text) ? `More evidence needed: ${c.text}` : c.text;
  const suffix = label && c.basis !== "gap" ? ` _(${label})_` : "";
  return `${text}${suffix}${cite(c.evidenceIds, index)}`;
}

function bullets(claims: Claim[], index: CitationIndex): string {
  return claims.length ? claims.map((c) => `- ${claim(c, index)}`).join("\n") : `- ${MORE_EVIDENCE}`;
}

function gaps(list: string[]): string {
  return list.length ? `\n\n**More evidence needed**\n\n${list.map((g) => `- ${g}`).join("\n")}` : "";
}

export function projectToMarkdown(project: Project): string {
  const { brief, outputs } = project;
  const index = buildCitationIndex(outputs.research);
  const rec = effectiveRecommendation(project);
  const out: string[] = [];

  out.push(`# ${brief.companyName}: strategy project`);
  out.push(
    [
      `**Business question:** ${brief.objective}`,
      brief.website && `**Website:** ${brief.website}`,
      brief.targetMarket && `**Target market:** ${brief.targetMarket}`,
      brief.geography && `**Geography:** ${brief.geography}`,
      brief.constraints && `**Constraints:** ${brief.constraints}`,
      `**Prepared:** ${new Date(project.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} with Strategy Agent`,
    ]
      .filter(Boolean)
      .join("  \n"),
  );
  out.push(
    "> Numbers in brackets link to sources. Items marked _Estimate_ or _Assumption_ are not stated by a source and should be validated. _More evidence needed_ marks questions the research could not answer.",
  );

  const summary = outputs.summary?.executiveSummary;
  out.push("## Executive summary");
  if (summary) {
    out.push(`**${summary.headline}**`);
    out.push(bullets(summary.situation, index));
    out.push(`**Recommendation.** ${rec?.edited ? `${rec.headline} ${rec.rationaleText ?? ""}`.trim() : summary.recommendation}`);
    out.push(`**Next steps**\n\n${summary.nextSteps.map((s) => `1. ${s}`).join("\n")}`);
  } else out.push(MORE_EVIDENCE);

  const market = outputs.market;
  out.push("## Market overview");
  if (market) {
    const m = market.marketOverview;
    out.push(bullets(m.summary, index));
    if (m.keyMetrics.length) {
      out.push(`| Metric | Value |\n| --- | --- |\n${m.keyMetrics.map((k) => `| ${esc(k.label)} | ${esc(claim(k.value, index))} |`).join("\n")}`);
    }
    out.push(`**Trends**\n\n${bullets(m.trends, index)}${gaps(m.evidenceGaps)}`);

    out.push("## Competitor comparison");
    const c = market.competitors;
    const cols = ["positioning", "targetCustomers", "offering", "pricing", "strengths", "weaknesses"] as const;
    out.push(
      `| Company | Positioning | Target customers | Offering | Pricing | Strengths | Weaknesses |\n| --- | --- | --- | --- | --- | --- | --- |\n${c.rows
        .map((r) => `| ${esc(r.isSubject ? `**${r.name}**` : r.name)} | ${cols.map((k) => esc(claim(r[k], index))).join(" | ")} |`)
        .join("\n")}`,
    );
    out.push(`**Takeaways**\n\n${bullets(c.takeaways, index)}${gaps(c.evidenceGaps)}`);

    out.push("## Customer segments");
    for (const s of market.segments.items) {
      out.push(
        `### ${s.name} (attractiveness: ${s.attractiveness})\n\n${claim(s.description, index)}\n\n- **Needs:** ${s.needs
          .map((n) => claim(n, index))
          .join("; ")}\n- **Size:** ${claim(s.sizeIndicator, index)}\n- **Why it matters:** ${claim(s.rationale, index)}`,
      );
    }
    out.push(gaps(market.segments.evidenceGaps).trim());
  }

  const strategy = outputs.strategy;
  if (strategy) {
    out.push("## Strategic options");
    for (const o of strategy.options) {
      out.push(
        `### Option ${o.id}: ${o.title}${rec?.optionId === o.id ? " (recommended)" : ""}\n\n${o.summary}\n\n**Benefits**\n\n${bullets(
          o.benefits,
          index,
        )}\n\n**Risks**\n\n${bullets(o.risks, index)}\n\n**Requirements**\n\n${bullets(o.requirements, index)}`,
      );
    }

    out.push("## Recommendation");
    if (rec) {
      out.push(`**Option ${rec.optionId}${rec.option ? `: ${rec.option.title}` : ""}.** ${rec.headline}`);
      if (rec.edited) out.push(`${rec.rationaleText ?? ""}\n\n_Edited by the project team._`);
      else {
        out.push(bullets(rec.rationaleClaims, index));
        out.push(`**Why not the other options**\n\n${bullets(strategy.recommendation.whyNotOthers, index)}`);
        out.push(`**What would change this recommendation**\n\n${bullets(strategy.recommendation.conditionsToRevisit, index)}`);
      }
    }
  }

  const business = outputs.business;
  if (business) {
    const b = business.businessCase;
    out.push("## Business case");
    out.push(`${b.summary}\n\n_All figures are in ${b.currency}. Projections are estimates derived from the assumptions below; validate the assumptions before using them._`);
    out.push(
      `**Assumptions**\n\n| ID | Assumption | Value | Basis | Rationale |\n| --- | --- | --- | --- | --- |\n${b.assumptions
        .map((a) => `| ${a.id} | ${esc(a.label)} | ${esc(a.value)} | ${BASIS_LABEL[a.basis] ?? "Sourced"}${cite(a.evidenceIds, index)} | ${esc(a.rationale)} |`)
        .join("\n")}`,
    );
    out.push(
      `**Projections (estimates)**\n\n| Metric | Conservative | Base | Upside | Derivation |\n| --- | --- | --- | --- | --- |\n${b.projections
        .map((p) => `| ${esc(p.metric)} | ${esc(p.conservative)} | ${esc(p.base)} | ${esc(p.upside)} | ${esc(p.derivation)} |`)
        .join("\n")}`,
    );
    if (b.investment.length) {
      out.push(
        `**Investment**\n\n| Item | Amount | Based on |\n| --- | --- | --- |\n${b.investment
          .map((i) => `| ${esc(i.item)} | ${esc(i.amount)} | ${i.assumptionIds.join(", ")} |`)
          .join("\n")}`,
      );
    }
    out.push(`**Risks to the case**\n\n${bullets(b.risksToCase, index)}${gaps(b.evidenceGaps)}`);

    const plan = business.ninetyDayPlan;
    out.push("## 90-day plan");
    for (const phase of plan.phases) {
      out.push(
        `### ${phase.name}: ${phase.goal}\n\n| Action | Owner | Deliverable |\n| --- | --- | --- |\n${phase.actions
          .map((a) => `| ${esc(a.action)} | ${esc(a.owner)} | ${esc(a.deliverable)} |`)
          .join("\n")}`,
      );
    }
    out.push(
      `**KPIs**\n\n${plan.kpis.map((k) => `- ${k.metric}: ${k.target}${k.basis !== "sourced" ? ` _(${BASIS_LABEL[k.basis]})_` : ""}`).join("\n")}`,
    );
    out.push(`**Decision points**\n\n${plan.decisionPoints.map((d) => `- ${d}`).join("\n")}`);
  }

  if (outputs.summary) out.push(`## Presentation outline\n\n${outlineBody(project)}`);

  const research = outputs.research;
  out.push("## Sources");
  if (research) {
    const cited = research.sources.filter((s) => s.cited);
    out.push(
      cited.map((s) => `${index.numbers.get(s.id)}. ${s.url ? `[${s.title}](${s.url})` : `${s.title} (${s.kind === "pdf" ? "uploaded PDF" : "user notes"})`}`).join("\n") ||
        MORE_EVIDENCE,
    );
    const consulted = research.sources.filter((s) => !s.cited);
    if (consulted.length) {
      out.push(`**Also consulted (not cited)**\n\n${consulted.map((s) => `- ${s.url ? `[${s.title}](${s.url})` : s.title}`).join("\n")}`);
    }
  } else out.push(MORE_EVIDENCE);

  return `${out.filter((s) => s.trim()).join("\n\n")}\n`;
}

function outlineBody(project: Project): string {
  const outline = project.outputs.summary?.presentationOutline;
  if (!outline) return "";
  const index = buildCitationIndex(project.outputs.research);
  return outline.slides
    .map((s, i) => {
      const refs = cite(s.evidenceIds, index);
      return `### Slide ${i + 1}: ${s.title}\n\n**Key message:** ${s.keyMessage}\n\n${s.bullets.map((b) => `- ${b}`).join("\n")}\n\n_Visual:_ ${s.visual}${refs ? `\n\n_Sources:_${refs}` : ""}`;
    })
    .join("\n\n");
}

export function outlineToMarkdown(project: Project): string {
  const outline = project.outputs.summary?.presentationOutline;
  if (!outline) return "";
  return `# ${outline.title}\n\n${outlineBody(project)}\n`;
}
