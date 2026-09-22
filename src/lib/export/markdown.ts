import type { Analysis } from "../analysis";
import type { VarianceTable } from "../calc/variance";
import { DRIVER_DEFS, FORECAST_LABELS } from "../fields";
import { formatFigure } from "../format";
import { FORECAST_SCENARIOS, type DriverKey, type DriverSet, type Figure } from "../model";
import { toSegments, type NarrativeDoc } from "../narrative/tokens";
import { periodLabel } from "../periods";
import type { ReviewSignoff } from "../project";

/** Builds the full report. Every figure is footnoted to the verification register at the end. */
export function reportMarkdown(a: Analysis, opts: { drivers: DriverSet; narratives: Partial<Record<"investor_update" | "board_pack", NarrativeDoc>>; review: ReviewSignoff; commentary: string }): string {
  const s = a.settings;
  const cur = s.currency;
  const refs = new Map<string, number>();
  const ref = (f: Figure) => {
    if (!refs.has(f.id)) refs.set(f.id, refs.size + 1);
    return refs.get(f.id)!;
  };
  const v = (f: Figure | null | undefined, signed = false) => {
    if (!f) return "—";
    const text = formatFigure(f, cur, { signed });
    return `${text}${f.verified ? "" : " **UNVERIFIED**"} [${ref(f)}]`;
  };
  const esc = (t: string) => t.replace(/\|/g, "\\|");
  // Literal numbers are checked only in text the model wrote, never in substituted figures.
  const narrative = (text: string) =>
    toSegments(text, a.figures, cur)
      .map((seg) => (seg.t === "fig" ? (a.figures[seg.id] ? v(a.figures[seg.id]) : "**UNVERIFIED: unknown figure**") : seg.t === "flag" ? `${seg.text} **UNVERIFIED**` : seg.text))
      .join("");
  const out: string[] = [];

  out.push(`# ${s.companyName}: finance report, ${periodLabel(s.reportingPeriod)}`);
  out.push(
    [
      `**Reporting currency:** ${cur}`,
      `**Fiscal year starts:** ${new Date(2000, s.fyStartMonth - 1).toLocaleString("en-US", { month: "long" })}`,
      `**Reviewed by:** ${opts.review.reviewer}, ${new Date(opts.review.reviewedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`,
      `**Prepared with:** Finance Analyst. All figures are calculated by deterministic code from the imported files; narrative was drafted by AI from verified figures only and reviewed by a person.`,
    ].join("  \n"),
  );
  out.push(`> Numbers in brackets refer to the verification register at the end, which gives each figure's formula and source (file, sheet, column, period, rows). **UNVERIFIED** marks a figure without a traceable source or one that failed reconciliation. Forecasts and assumptions are labeled as such.`);

  out.push("## Verification summary");
  out.push(
    `- ${a.summary.verified} of ${a.summary.figures} calculated figures verified; ${a.summary.unverified} unverified.\n- Reconciliation: ${a.summary.checksPassed} passed, ${a.summary.checksFailed} failed, ${a.summary.checksSkipped} skipped.\n- Data quality: ${a.issues.filter((i) => i.severity === "error").length} errors, ${a.issues.filter((i) => i.severity === "warning").length} warnings, ${a.issues.filter((i) => i.severity === "info").length} notes.`,
  );

  out.push("## Data-quality report");
  const important = a.issues.filter((i) => i.severity !== "info");
  out.push(
    important.length
      ? `| Severity | Where | Issue |\n| --- | --- | --- |\n${important.map((i) => `| ${i.severity} | ${esc([i.file, i.sheet, i.row ? `row ${i.row}` : "", i.column].filter(Boolean).join(" › ") || i.dataset || "")} | ${esc(i.message)} |`).join("\n")}`
      : "No errors or warnings.",
  );
  out.push(`**Reconciliation checks**\n\n| Check | Status | Detail |\n| --- | --- | --- |\n${a.checks.map((c) => `| ${esc(c.label)} | ${c.status.toUpperCase()} | ${esc(c.detail)} |`).join("\n")}`);

  const varianceMd = (t: VarianceTable) => {
    const cmp = t.comparisonScenario === "budget" ? "Budget" : "Prior";
    return `### ${t.title}\n\n| Line | Actual | ${cmp} | Variance | Variance % |\n| --- | ---: | ---: | ---: | ---: |\n${t.lines
      .map((l) => {
        const name = l.level === "account" ? `  ${l.label}` : `**${l.label}**`;
        return `| ${esc(name)} | ${v(l.actual)} | ${v(l.comparison)} | ${v(l.amount, true)} | ${v(l.pct, true)} |`;
      })
      .join("\n")}`;
  };
  out.push("## Variance analysis");
  out.push(varianceMd(a.variance.month.budget));
  out.push(varianceMd(a.variance.month.prior));
  out.push(varianceMd(a.variance.ytd.budget));

  out.push("## Forecast (not actuals)");
  out.push(`Forecasts start from the ${periodLabel(s.reportingPeriod)} actuals and apply the assumptions below.`);
  out.push(assumptionsMd(opts.drivers, a, v));
  for (const sc of FORECAST_SCENARIOS) {
    const f = a.forecast[sc];
    out.push(
      `### ${FORECAST_LABELS[sc]} forecast\n\n| Month | Revenue | Operating result | Net cash flow | Closing cash |\n| --- | ---: | ---: | ---: | ---: |\n${f.months
        .map((m) => `| ${periodLabel(m.period)} | ${v(m.revenue)} | ${v(m.operatingResult)} | ${v(m.netCashFlow)} | ${v(m.closingCash)} |`)
        .join("\n")}`,
    );
  }

  out.push("## Cash runway");
  out.push(
    `| Scenario | Current cash | Average monthly net burn | Runway | Months until cash reaches zero |\n| --- | ---: | ---: | ---: | ---: |\n${FORECAST_SCENARIOS.map((sc) => {
      const r = a.runway[sc];
      return `| ${FORECAST_LABELS[sc]} | ${v(r.currentCash)} | ${v(r.averageBurn)} | ${v(r.runway)} | ${v(r.projected)} |`;
    }).join("\n")}\n\nRunway = current cash ÷ average forecast monthly net burn.`,
  );

  out.push("## MRR bridge");
  out.push(
    `| Month | Starting | + New | + Expansion | − Contraction | − Churn | = Ending | Reported ending |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${a.mrr
      .map((b) => `| ${periodLabel(b.period)} | ${v(b.starting)} | ${v(b.new)} | ${v(b.expansion)} | ${v(b.contraction)} | ${v(b.churn)} | ${v(b.ending)} | ${v(b.reportedEnding)} |`)
      .join("\n")}`,
  );

  const narrativeMd = (doc: NarrativeDoc | undefined, title: string, extra?: string) => {
    out.push(`## ${title}`);
    if (!doc) {
      out.push("_Not drafted._");
      return;
    }
    out.push(`_Draft by ${doc.model}, ${new Date(doc.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Reviewed before export._`);
    for (const sec of doc.sections) {
      out.push(`### ${sec.heading}`);
      if (sec.heading === "KPIs" && extra) out.push(extra);
      sec.paragraphs.forEach((p) => out.push(narrative(p)));
      if (sec.bullets.length) out.push(sec.bullets.map((b) => `- ${narrative(b)}`).join("\n"));
    }
    if (doc.flags.length) out.push(`**Review flags**\n\n${doc.flags.map((f) => `- ${f.section}: ${f.message}`).join("\n")}`);
  };
  narrativeMd(opts.narratives.investor_update, "Investor update (draft)");
  const kpiTable = `| KPI | Value |\n| --- | ---: |\n${a.kpis.map((id) => `| ${esc(a.figures[id].label)} | ${v(a.figures[id])} |`).join("\n")}`;
  narrativeMd(opts.narratives.board_pack, "Board pack: finance section", kpiTable);
  if (opts.commentary.trim()) out.push(`**Management commentary provided for drafting**\n\n> ${opts.commentary.trim().replace(/\n/g, "\n> ")}`);

  out.push("## Verification and assumptions register");
  out.push(
    `| # | Figure | Value | Kind | Status | Formula | Sources |\n| ---: | --- | ---: | --- | --- | --- | --- |\n${[...refs.entries()]
      .map(([id, n]) => {
        const f = a.figures[id];
        const src = f.sources.length ? f.sources.map((x) => `${x.file} › ${x.sheet} › ${x.column} › ${x.period} › row${x.rows.length > 1 ? "s" : ""} ${x.rows.join(", ")}`).join("; ") : f.inputs.length ? `Calculated from ${f.inputs.length} figure${f.inputs.length > 1 ? "s" : ""}` : "None";
        return `| ${n} | ${esc(f.label)} | ${formatFigure(f, cur)} | ${f.kind} | ${f.verified ? "Verified" : `UNVERIFIED: ${esc(f.reasons.join("; "))}`} | ${esc(f.formula)} | ${esc(src)} |`;
      })
      .join("\n")}`,
  );
  return `${out.join("\n\n")}\n`;
}

function assumptionsMd(drivers: DriverSet, a: Analysis, v: (f: Figure) => string): string {
  const keys = Object.keys(DRIVER_DEFS) as DriverKey[];
  return `| Assumption | ${FORECAST_SCENARIOS.map((s) => FORECAST_LABELS[s]).join(" | ")} | Origin |\n| --- | ${FORECAST_SCENARIOS.map(() => "---:").join(" | ")} | --- |\n${keys
    .map((k) => {
      const origin = drivers.base[k].origin;
      const o = origin.type === "file" ? `${origin.source.file} › ${origin.source.sheet}` : origin.type === "user" ? "Entered by user" : "Default (unconfirmed)";
      return `| ${DRIVER_DEFS[k].label} | ${FORECAST_SCENARIOS.map((s) => v(a.forecast[s].assumptions[k])).join(" | ")} | ${o} |`;
    })
    .join("\n")}`;
}
