// Generates the fictional Brightwave Analytics demo files in public/samples/.
// Usage: npm run samples:generate
//
// All numbers are invented. Deliberate data-quality issues for the demo:
//   - MRR: February's reported ending MRR is $250 higher than its bridge (reconciliation failure).
//   - Cash: March investing cash flow is blank (missing value; net cash flow is still reported).

import { mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const OUT = "public/samples";
mkdirSync(OUT, { recursive: true });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (m, yy) => `${MONTHS[m]}-${yy}`;
const round = (n, to = 1) => Math.round(n / to) * to;
// Deterministic "noise" so the files look real but are reproducible.
const wobble = (i, amp, seed = 1) => Math.round(Math.sin((i + 1) * 1.7 * seed) * amp);

// ---------- MRR movements, Jan–Jun 2026 ----------
const mrrRows = [];
let starting = 380_000;
for (let m = 0; m < 6; m++) {
  const added = 24_000 + wobble(m, 3_000, 1.3);
  const expansion = 7_500 + wobble(m, 1_200, 2.1);
  const contraction = 2_400 + wobble(m, 500, 0.7);
  const churn = 6_000 + wobble(m, 900, 1.9);
  const ending = starting + added + expansion - contraction - churn;
  const reported = m === 1 ? ending + 250 : ending; // February does not reconcile
  mrrRows.push({ month: `2026-${String(m + 1).padStart(2, "0")}`, starting, added, expansion, contraction, churn, ending, reported });
  starting = ending;
}
const mrrCsv = [
  "Month,Starting MRR,New MRR,Expansion MRR,Contraction MRR,Churned MRR,Ending MRR,Currency",
  ...mrrRows.map((r) => [r.month, r.starting, r.added, r.expansion, r.contraction, r.churn, r.reported, "USD"].join(",")),
].join("\n");
writeFileSync(`${OUT}/brightwave_mrr_2026.csv`, `${mrrCsv}\n`);

// ---------- P&L ----------
const LINES = [
  ["Revenue", null],
  ["Subscription revenue", "Revenue"],
  ["Professional services", "Revenue"],
  ["Total revenue", "Revenue"],
  ["Cost of revenue", null],
  ["Hosting & infrastructure", "COGS"],
  ["Customer support", "COGS"],
  ["Operating expenses", null],
  ["Sales & marketing", "Opex"],
  ["Research & development", "Opex"],
  ["General & administrative", "Opex"],
];

function pnlValues(kind, m) {
  // kind: actual (2026), budget (2026), prior (2025)
  if (kind === "actual") {
    const r = mrrRows[m];
    const subscription = round((r.starting + r.ending) / 2);
    return {
      "Subscription revenue": subscription,
      "Professional services": 21_000 + wobble(m, 3_500, 1.1),
      "Hosting & infrastructure": round(subscription * 0.11),
      "Customer support": 44_000 + wobble(m, 1_800, 1.7),
      "Sales & marketing": 188_000 + wobble(m, 9_000, 0.9),
      "Research & development": 216_000 + wobble(m, 5_000, 1.4),
      "General & administrative": 89_000 + wobble(m, 3_000, 2.3),
    };
  }
  if (kind === "budget") {
    const subscription = round(386_000 * 1.025 ** m, 100);
    return {
      "Subscription revenue": subscription,
      "Professional services": 20_000,
      "Hosting & infrastructure": round(subscription * 0.11, 100),
      "Customer support": 44_000,
      "Sales & marketing": 190_000 + m * 1_000,
      "Research & development": 215_000 + m * 1_000,
      "General & administrative": 88_000,
    };
  }
  const subscription = round(290_000 * 1.021 ** m, 10);
  return {
    "Subscription revenue": subscription,
    "Professional services": 16_000 + wobble(m, 2_500, 0.6),
    "Hosting & infrastructure": round(subscription * 0.125),
    "Customer support": 38_000 + wobble(m, 1_500, 1.2),
    "Sales & marketing": 150_000 + wobble(m, 7_000, 1.6),
    "Research & development": 182_000 + wobble(m, 4_000, 0.8),
    "General & administrative": 76_000 + wobble(m, 2_500, 2.7),
  };
}

function pnlSheet(title, kind, months, yy) {
  const rows = [[title], [], ["Account", "Category", ...months.map((m) => label(m, yy))]];
  for (const [name, category] of LINES) {
    if (category === null) {
      rows.push([name]);
      continue;
    }
    if (name === "Total revenue") {
      rows.push([name, category, ...months.map((m) => {
        const v = pnlValues(kind, m);
        return v["Subscription revenue"] + v["Professional services"];
      })]);
      continue;
    }
    rows.push([name, category, ...months.map((m) => pnlValues(kind, m)[name])]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 10 }, ...months.map(() => ({ wch: 11 }))];
  return ws;
}

const first6 = [0, 1, 2, 3, 4, 5];
const all12 = [...Array(12).keys()];
const pnl = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(pnl, pnlSheet("Brightwave Analytics — Profit & Loss, actuals (USD)", "actual", first6, "26"), "Actuals FY26");
XLSX.utils.book_append_sheet(pnl, pnlSheet("Brightwave Analytics — Budget FY2026 (USD)", "budget", all12, "26"), "Budget FY26");
XLSX.utils.book_append_sheet(pnl, pnlSheet("Brightwave Analytics — Profit & Loss, prior year (USD)", "prior", all12, "25"), "Prior Year FY25");
XLSX.utils.book_append_sheet(
  pnl,
  XLSX.utils.aoa_to_sheet([["Notes"], ["Fictional company for demonstration only."], ["Amounts in US dollars. Costs are positive numbers."]]),
  "Notes",
);
writeFileSync(`${OUT}/brightwave_pnl_fy2026.xlsx`, XLSX.write(pnl, { type: "buffer", bookType: "xlsx" }));

// ---------- Cash, Jan–Jun 2026 ----------
let opening = 6_400_000;
const cashLines = ["Month,Opening cash,Operating cash flow,Investing cash flow,Financing cash flow,Net cash flow,Closing cash,Currency"];
for (const m of first6) {
  const v = pnlValues("actual", m);
  const revenue = v["Subscription revenue"] + v["Professional services"];
  const costs = Object.entries(v).filter(([k]) => !["Subscription revenue", "Professional services"].includes(k)).reduce((s, [, x]) => s + x, 0);
  const operating = revenue - costs + wobble(m, 12_000, 1.5);
  const investing = -(18_000 + wobble(m, 4_000, 2.2));
  const financing = 0;
  const net = operating + investing + financing;
  const closing = opening + net;
  const investingCell = m === 2 ? "" : investing; // March left blank on purpose
  cashLines.push([`2026-${String(m + 1).padStart(2, "0")}`, opening, operating, investingCell, financing, net, closing, "USD"].join(","));
  opening = closing;
}
writeFileSync(`${OUT}/brightwave_cash_2026.csv`, `${cashLines.join("\n")}\n`);

// ---------- Forecast drivers ----------
const drivers = XLSX.utils.book_new();
const driverRows = [
  ["Driver", "Base", "Upside", "Downside", "Unit", "Notes"],
  ["Revenue growth (MoM)", 3.0, 5.0, -1.0, "% per month", "Applied to total revenue"],
  ["Gross margin", 78.0, 80.0, 74.0, "% of revenue", ""],
  ["Opex growth (MoM)", 1.0, 1.5, 1.0, "% per month", "Headcount plan"],
  ["Other cash flow", -20_000, -15_000, -40_000, "USD per month", "Capex and working capital"],
];
const dws = XLSX.utils.aoa_to_sheet(driverRows);
dws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 28 }];
XLSX.utils.book_append_sheet(drivers, dws, "Drivers");
writeFileSync(`${OUT}/brightwave_forecast_drivers.xlsx`, XLSX.write(drivers, { type: "buffer", bookType: "xlsx" }));

console.log(`Wrote 4 sample files to ${OUT}/`);
