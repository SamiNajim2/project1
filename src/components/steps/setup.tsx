"use client";

import { CURRENCIES } from "@/lib/numbers";
import type { ProjectSettings } from "@/lib/model";
import { Card, Field, SectionTitle, inputClass } from "../ui";
import { useWorkspace } from "../workspace";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function SetupStep() {
  const { project, update } = useWorkspace();
  const s = project.settings;
  const set = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => update((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));

  return (
    <div>
      <SectionTitle title="Company & reporting period" subtitle="These settings drive every calculation. Amounts in any other currency are flagged, never converted." />
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <Field label="Company name" htmlFor="company">
          <input id="company" className={inputClass} value={s.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Acme Ltd" />
        </Field>
        <Field label="Reporting currency" htmlFor="currency" hint="No FX conversion is applied.">
          <select id="currency" className={inputClass} value={s.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Reporting month" htmlFor="period" hint="The month being reported on. Forecasts start the month after.">
          <input id="period" type="month" className={inputClass} value={s.reportingPeriod} onChange={(e) => e.target.value && set("reportingPeriod", e.target.value)} />
        </Field>
        <Field label="Fiscal year starts in" htmlFor="fy" hint="Used for year-to-date figures.">
          <select id="fy" className={inputClass} value={s.fyStartMonth} onChange={(e) => set("fyStartMonth", Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-ink">Compare actuals with the prior period as</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["prior_year", "Same month last year", "Uses the data you map as “Prior period”."],
                ["prior_month", "Previous month", "Uses last month's actuals."],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${s.priorBasis === value ? "border-orange-500 bg-orange-50" : "border-cream-300 bg-white"}`}>
                <input type="radio" name="prior" checked={s.priorBasis === value} onChange={() => set("priorBasis", value)} className="mt-0.5 accent-orange-600" />
                <span>
                  <span className="font-medium text-ink">{label}</span>
                  <span className="block text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Forecast horizon (months)" htmlFor="horizon">
          <input
            id="horizon"
            type="number"
            min={3}
            max={36}
            className={inputClass}
            value={s.forecastMonths}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (n >= 3 && n <= 36) set("forecastMonths", n);
            }}
          />
        </Field>
      </Card>
    </div>
  );
}
