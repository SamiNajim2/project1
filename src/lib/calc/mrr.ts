import { formatMoney, round2 } from "../format";
import type { Figure, Issue, MrrRecord, ReconciliationCheck } from "../model";
import { addMonths, periodLabel } from "../periods";
import { taintReasons } from "../validate";
import { derive, leaf, type FigureRegistry } from "./figures";

// ---------- Pure MRR maths (unit tested) ----------

/** Starting MRR + new + expansion − contraction − churn = ending MRR. Contraction and churn are magnitudes. */
export function mrrEnding(starting: number, added: number, expansion: number, contraction: number, churn: number): number {
  return round2(starting + added + expansion - contraction - churn);
}

export function netNewMrr(added: number, expansion: number, contraction: number, churn: number): number {
  return round2(added + expansion - contraction - churn);
}

/** Gross revenue retention for the month: (start − contraction − churn) ÷ start. */
export function grossRetention(starting: number, contraction: number, churn: number): number | null {
  return starting === 0 ? null : ((starting - contraction - churn) / starting) * 100;
}

/** Net revenue retention for the month: (start + expansion − contraction − churn) ÷ start. */
export function netRetention(starting: number, expansion: number, contraction: number, churn: number): number | null {
  return starting === 0 ? null : ((starting + expansion - contraction - churn) / starting) * 100;
}

export interface MrrBridge {
  period: string;
  starting: Figure;
  new: Figure;
  expansion: Figure;
  contraction: Figure;
  churn: Figure;
  ending: Figure;
  reportedEnding: Figure | null;
  netNew: Figure;
  grr: Figure;
  nrr: Figure;
  arr: Figure;
}

const LABELS = { starting: "Starting MRR", new: "New MRR", expansion: "Expansion MRR", contraction: "Contraction MRR", churn: "Churned MRR", ending: "Ending MRR (reported)" } as const;

export function buildMrr(reg: FigureRegistry, records: MrrRecord[], issues: Issue[], currency: string, checks: ReconciliationCheck[]): MrrBridge[] {
  const bridges: MrrBridge[] = [];
  const byPeriod = new Map<string, MrrBridge>();

  for (const r of records) {
    const label = periodLabel(r.period);
    const reasons = taintReasons(issues, { dataset: "mrr", period: r.period });
    const field = (f: keyof typeof LABELS) => {
      const v = r.values[f];
      const src = r.sources[f];
      return leaf(reg, {
        id: `mrr.${r.period}.${f === "ending" ? "reported_ending" : f}`,
        label: `${LABELS[f]} — ${label}`,
        kind: "actual",
        period: r.period,
        formula: `${LABELS[f]} as reported for ${label}`,
        cells: v === undefined || !src ? [] : [{ amount: v, source: src, period: r.period }],
        reasons,
        missingReason: `${LABELS[f]} is missing for ${label}`,
      });
    };

    const prev = byPeriod.get(addMonths(r.period, -1));
    let starting: Figure;
    if (r.values.starting !== undefined) starting = field("starting");
    else if (prev) {
      starting = derive(reg, { id: `mrr.${r.period}.starting`, label: `Starting MRR — ${label}`, kind: "derived", unit: "currency", period: r.period, formula: `= Ending MRR of ${periodLabel(prev.period)} (bridge)`, inputs: [prev.ending], compute: ([e]) => e });
    } else starting = field("starting");

    const added = field("new");
    const expansion = field("expansion");
    const contraction = field("contraction");
    const churn = field("churn");
    const ending = derive(reg, {
      id: `mrr.${r.period}.ending`,
      label: `Ending MRR — ${label}`,
      kind: "derived",
      unit: "currency",
      period: r.period,
      formula: "Starting MRR + New + Expansion − Contraction − Churn",
      inputs: [starting, added, expansion, contraction, churn],
      compute: ([s, n, e, c, ch]) => mrrEnding(s, n, e, c, ch),
    });
    const reportedEnding = r.values.ending !== undefined ? field("ending") : null;

    // Reconciliation: the bridge must agree with the reported ending MRR and with last month's ending.
    if (reportedEnding?.value != null && ending.value !== null) {
      const diff = round2(reportedEnding.value - ending.value);
      const pass = Math.abs(diff) < 0.5;
      checks.push({
        id: `rec.mrr.${r.period}.ending`,
        label: `MRR bridge = reported ending MRR (${label})`,
        status: pass ? "pass" : "fail",
        expected: ending.value,
        actual: reportedEnding.value,
        difference: diff,
        detail: pass ? `Bridge and reported ending MRR agree at ${formatMoney(ending.value, currency)}.` : `Reported ending MRR ${formatMoney(reportedEnding.value, currency)} differs from the bridge ${formatMoney(ending.value, currency)} by ${formatMoney(diff, currency)}.`,
        affects: [ending.id, reportedEnding.id],
      });
      if (!pass) {
        reg.flag(ending.id, `Fails reconciliation: reported ending MRR differs from the bridge by ${formatMoney(diff, currency)}`);
        reg.flag(reportedEnding.id, `Fails reconciliation: differs from the bridge by ${formatMoney(diff, currency)}`);
      }
    }
    if (prev && r.values.starting !== undefined && prev.ending.value !== null && starting.value !== null) {
      const diff = round2(starting.value - prev.ending.value);
      const pass = Math.abs(diff) < 0.5;
      checks.push({
        id: `rec.mrr.${r.period}.starting`,
        label: `Starting MRR = previous ending MRR (${label})`,
        status: pass ? "pass" : "fail",
        expected: prev.ending.value,
        actual: starting.value,
        difference: diff,
        detail: pass ? "Starting MRR continues from last month's bridge." : `Starting MRR ${formatMoney(starting.value, currency)} does not continue from ${periodLabel(prev.period)} ending ${formatMoney(prev.ending.value, currency)}.`,
        affects: [starting.id],
      });
      if (!pass) reg.flag(starting.id, `Fails reconciliation: does not continue from ${periodLabel(prev.period)} ending MRR`);
    }

    const common = { kind: "derived" as const, period: r.period };
    const bridge: MrrBridge = {
      period: r.period,
      starting: reg.get(starting.id)!,
      new: added,
      expansion,
      contraction,
      churn,
      ending: reg.get(ending.id)!,
      reportedEnding,
      netNew: derive(reg, { ...common, id: `mrr.${r.period}.net_new`, label: `Net new MRR — ${label}`, unit: "currency", formula: "New + Expansion − Contraction − Churn", inputs: [added, expansion, contraction, churn], compute: ([n, e, c, ch]) => netNewMrr(n, e, c, ch) }),
      grr: derive(reg, { ...common, id: `mrr.${r.period}.grr`, label: `Gross revenue retention (monthly) — ${label}`, unit: "percent", formula: "(Starting MRR − Contraction − Churn) ÷ Starting MRR × 100", inputs: [starting, contraction, churn], compute: ([s, c, ch]) => grossRetention(s, c, ch), note: "n/a (starting MRR is zero)" }),
      nrr: derive(reg, { ...common, id: `mrr.${r.period}.nrr`, label: `Net revenue retention (monthly) — ${label}`, unit: "percent", formula: "(Starting MRR + Expansion − Contraction − Churn) ÷ Starting MRR × 100", inputs: [starting, expansion, contraction, churn], compute: ([s, e, c, ch]) => netRetention(s, e, c, ch), note: "n/a (starting MRR is zero)" }),
      arr: derive(reg, { ...common, id: `mrr.${r.period}.arr`, label: `ARR run-rate — ${label}`, unit: "currency", formula: "Ending MRR × 12", inputs: [ending], compute: ([e]) => e * 12 }),
    };
    bridges.push(bridge);
    byPeriod.set(r.period, bridge);
  }
  return bridges;
}
