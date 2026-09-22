import { formatMoney, round2 } from "../format";
import type { CashRecord, Figure, Issue, ReconciliationCheck } from "../model";
import { addMonths, periodLabel } from "../periods";
import { taintReasons } from "../validate";
import { leaf, type FigureRegistry } from "./figures";

const FIELD_LABELS = { opening: "Opening cash", operating: "Operating cash flow", investing: "Investing cash flow", financing: "Financing cash flow", net: "Net cash flow", ending: "Closing cash" } as const;
type Field = keyof typeof FIELD_LABELS;

export interface CashMonth {
  period: string;
  figures: Partial<Record<Field, Figure>>;
}

/** Cash figures per month, with roll-forward reconciliation: previous close + net flow = close. */
export function buildCash(reg: FigureRegistry, records: CashRecord[], issues: Issue[], currency: string, checks: ReconciliationCheck[]): CashMonth[] {
  const months: CashMonth[] = [];
  const byPeriod = new Map(records.map((r) => [r.period, r]));
  for (const r of records) {
    const reasons = taintReasons(issues, { dataset: "cash", period: r.period });
    const figures: CashMonth["figures"] = {};
    for (const f of Object.keys(FIELD_LABELS) as Field[]) {
      const v = r.values[f];
      const src = r.sources[f];
      if (v === undefined || !src) continue;
      figures[f] = leaf(reg, {
        id: `cash.${r.period}.${f}`,
        label: `${FIELD_LABELS[f]} — Actual, ${periodLabel(r.period)}`,
        kind: "actual",
        period: r.period,
        formula: `${FIELD_LABELS[f]} as reported for ${periodLabel(r.period)}`,
        cells: [{ amount: v, source: src, period: r.period }],
        reasons,
      });
    }
    months.push({ period: r.period, figures });
  }

  const fail = (id: string, label: string, expected: number, actual: number, detail: string, affects: string[]) => {
    const difference = round2(actual - expected);
    const pass = Math.abs(difference) < 0.5;
    checks.push({ id, label, status: pass ? "pass" : "fail", expected, actual, difference, detail: pass ? detail : `${detail} Difference ${formatMoney(difference, currency)}.`, affects });
    if (!pass) for (const a of affects) reg.flag(a, `Fails reconciliation: ${label} (difference ${formatMoney(difference, currency)})`);
  };

  for (const m of months) {
    const { opening, operating, investing, financing, net, ending } = m.figures;
    const prev = byPeriod.get(addMonths(m.period, -1));
    const prevEnding = prev?.values.ending;
    const label = periodLabel(m.period);
    if (prevEnding !== undefined && opening?.value != null) {
      fail(`rec.cash.${m.period}.opening`, `Opening cash = previous closing cash (${label})`, prevEnding, opening.value, `Opening ${formatMoney(opening.value, currency)} vs previous closing ${formatMoney(prevEnding, currency)}.`, [opening.id]);
    }
    const start = opening?.value ?? prevEnding;
    if (start !== undefined && start !== null && net?.value != null && ending?.value != null) {
      fail(`rec.cash.${m.period}.rollforward`, `Opening cash + net cash flow = closing cash (${label})`, round2(start + net.value), ending.value, `${formatMoney(start, currency)} + ${formatMoney(net.value, currency)} should equal ${formatMoney(ending.value, currency)}.`, [ending.id]);
    }
    if (operating?.value != null && investing?.value != null && financing?.value != null && net?.value != null) {
      fail(`rec.cash.${m.period}.components`, `Operating + investing + financing = net cash flow (${label})`, round2(operating.value + investing.value + financing.value), net.value, "Cash-flow components against reported net cash flow.", [net.id]);
    }
  }
  return months;
}
