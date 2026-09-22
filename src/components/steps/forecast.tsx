"use client";

import { useState } from "react";
import { forecastCsv, periodSlug, runwayCsv } from "@/lib/export/csv";
import { DRIVER_DEFS, FORECAST_LABELS } from "@/lib/fields";
import { FORECAST_SCENARIOS, type DriverKey, type ForecastScenario } from "@/lib/model";
import { periodLabel } from "@/lib/periods";
import { CashChart, type Series } from "../charts";
import { FigureValue, KindLegend } from "../figure";
import { Banner, Button, Card, Pill, SectionTitle, download, inputClass } from "../ui";
import { useWorkspace } from "../workspace";

const SCENARIO_COLOR: Record<ForecastScenario, string> = { base: "#2a78d6", upside: "#eb6834", downside: "#1baf7a" };

function DriverCell({ scenario, k }: { scenario: ForecastScenario; k: DriverKey }) {
  const { input, update } = useWorkspace();
  const d = input.drivers[scenario][k];
  const def = DRIVER_DEFS[k];
  const [text, setText] = useState(String(d.value));
  const commit = () => {
    const n = Number(text.replace(/[,%\s]/g, ""));
    if (!Number.isFinite(n) || n === d.value) return setText(String(d.value));
    update((p) => ({ ...p, driverEdits: { ...p.driverEdits, [scenario]: { ...p.driverEdits[scenario], [k]: { value: n, editedAt: new Date().toISOString() } } }, review: null }));
  };
  const origin = d.origin.type;
  return (
    <td className="px-3 py-2 align-top">
      <div className="flex items-center gap-1.5">
        <input
          aria-label={`${FORECAST_LABELS[scenario]} ${def.label}`}
          className={`${inputClass} num w-28 text-right text-assumption`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <span className="text-xs text-muted">{def.unit === "percent" ? "%" : input.settings.currency}</span>
      </div>
      <div className="mt-1">
        {origin === "file" ? <Pill tone="assumption">File</Pill> : origin === "user" ? <Pill tone="orange">Edited</Pill> : <Pill tone="warn">Default · unconfirmed</Pill>}
      </div>
    </td>
  );
}

export function ForecastStep() {
  const { analysis: a, input, project, update } = useWorkspace();
  const [tab, setTab] = useState<ForecastScenario>("base");
  const keys = Object.keys(DRIVER_DEFS) as DriverKey[];
  const hasDefaults = FORECAST_SCENARIOS.some((s) => keys.some((k) => input.drivers[s][k].origin.type === "default"));
  const hasEdits = FORECAST_SCENARIOS.some((s) => Object.keys(project.driverEdits[s] ?? {}).length > 0);

  const confirmDefaults = () =>
    update((p) => {
      const edits = { ...p.driverEdits };
      const now = new Date().toISOString();
      for (const s of FORECAST_SCENARIOS) {
        for (const k of keys) {
          const d = input.drivers[s][k];
          if (d.origin.type === "default") edits[s] = { ...edits[s], [k]: { value: d.value, editedAt: now } };
        }
      }
      return { ...p, driverEdits: edits, review: null };
    });

  const series: Series[] = [
    { key: "actual", label: "Actual", color: "#2a2019", dashed: false, points: a.cash.filter((c) => c.figures.ending && c.period <= a.settings.reportingPeriod).map((c) => ({ period: c.period, figure: c.figures.ending! })) },
    ...FORECAST_SCENARIOS.map((s) => ({
      key: s,
      label: FORECAST_LABELS[s],
      color: SCENARIO_COLOR[s],
      dashed: true,
      points: [{ period: a.settings.reportingPeriod, figure: a.runway[s].currentCash }, ...a.forecast[s].months.map((m) => ({ period: m.period, figure: m.closingCash }))],
    })),
  ];
  const f = a.forecast[tab];
  const rows = [
    ["Revenue", "revenue"],
    ["Cost of revenue", "cogs"],
    ["Gross profit", "grossProfit"],
    ["Operating expenses", "opex"],
    ["Operating result", "operatingResult"],
    ["Net cash flow", "netCashFlow"],
    ["Closing cash", "closingCash"],
  ] as const;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Forecast & cash runway"
        subtitle={`Three scenarios projected from ${periodLabel(a.settings.reportingPeriod)} actuals using editable drivers. Forecast figures are shown in italic blue; assumptions in violet.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => download(`forecast-${periodSlug(a)}.csv`, forecastCsv(a), "text/csv")}>
              Forecast CSV
            </Button>
            <Button variant="secondary" onClick={() => download(`runway-${periodSlug(a)}.csv`, runwayCsv(a), "text/csv")}>
              Runway CSV
            </Button>
          </>
        }
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">Drivers (assumptions)</h3>
            <p className="text-sm text-muted">Edit any value; the forecast recalculates immediately. Growth rates are monthly.</p>
          </div>
          <div className="flex gap-2">
            {hasDefaults && <Button onClick={confirmDefaults}>Confirm default assumptions</Button>}
            {hasEdits && (
              <Button variant="ghost" onClick={() => confirm("Discard all edits and use the imported or default values?") && update((p) => ({ ...p, driverEdits: {}, review: null }))}>
                Reset edits
              </Button>
            )}
          </div>
        </div>
        {hasDefaults && (
          <div className="mt-3">
            <Banner tone="warn" title="Some assumptions are system defaults">Forecasts that use them are UNVERIFIED until you confirm or edit the values. Import a drivers sheet to supply them from a file.</Banner>
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-cream-300 text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Driver</th>
                {FORECAST_SCENARIOS.map((s) => (
                  <th key={s} className="px-3 py-2 font-semibold">
                    {FORECAST_LABELS[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-b border-cream-200">
                  <td className="py-2 pr-3 align-top">
                    <p className="text-ink">{DRIVER_DEFS[k].label}</p>
                    <p className="text-xs text-muted">{DRIVER_DEFS[k].help}</p>
                  </td>
                  {FORECAST_SCENARIOS.map((s) => (
                    <DriverCell key={`${s}-${k}-${input.drivers[s][k].value}`} scenario={s} k={k} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {FORECAST_SCENARIOS.map((s) => {
          const r = a.runway[s];
          return (
            <Card key={s} className="p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="size-2.5 rounded-full" style={{ background: SCENARIO_COLOR[s] }} />
                  {FORECAST_LABELS[s]} runway
                </p>
                <Pill tone="forecast">Forecast</Pill>
              </div>
              <p className="mt-3 font-display text-3xl font-semibold">
                <FigureValue figure={r.runway} />
              </p>
              <p className="mt-1 text-xs text-muted">Current cash ÷ average monthly net burn</p>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Current cash</dt>
                  <dd>
                    <FigureValue figure={r.currentCash} />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Avg. monthly net burn</dt>
                  <dd>
                    <FigureValue figure={r.averageBurn} />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Cash reaches zero</dt>
                  <dd className="text-right">{r.cashOutPeriod ? <span className="text-forecast italic">{r.cashOutPeriod}</span> : <FigureValue figure={r.projected} />}</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink">Closing cash: actual and forecast</h3>
        <CashChart series={series} currency={a.settings.currency} splitPeriod={a.settings.reportingPeriod} />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h3 className="font-display text-lg font-semibold text-ink">Monthly forecast</h3>
          <div className="inline-flex rounded-xl bg-cream-200 p-1 text-sm" role="tablist">
            {FORECAST_SCENARIOS.map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`rounded-lg px-3 py-1 ${tab === s ? "bg-white font-medium text-ink shadow-sm" : "text-muted"}`}>
                {FORECAST_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pt-3">
          <KindLegend />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-y border-cream-300 bg-cream-100 text-xs text-muted">
                <th className="sticky left-0 bg-cream-100 px-5 py-2 text-left font-semibold uppercase tracking-wide">{FORECAST_LABELS[tab]} forecast</th>
                {f.months.map((m) => (
                  <th key={m.period} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    {periodLabel(m.period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key]) => (
                <tr key={key} className={`border-b border-cream-200 ${key === "operatingResult" || key === "closingCash" ? "font-semibold" : ""}`}>
                  <td className="sticky left-0 bg-cream-50 px-5 py-2 whitespace-nowrap text-ink">{label}</td>
                  {f.months.map((m) => (
                    <td key={m.period} className="px-3 py-2 text-right whitespace-nowrap">
                      <FigureValue figure={m[key]} compact />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
