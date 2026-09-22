"use client";

import { useState } from "react";
import type { MrrBridge } from "@/lib/calc/mrr";
import { formatMoney } from "@/lib/format";
import type { Figure } from "@/lib/model";
import { periodLabel } from "@/lib/periods";

export interface Series {
  key: string;
  label: string;
  color: string;
  dashed: boolean;
  points: { period: string; figure: Figure }[];
}

const W = 760;
const H = 300;
const M = { l: 64, r: 96, t: 16, b: 30 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= count) ?? step * 10;
  const start = Math.floor(min / nice) * nice;
  const ticks: number[] = [];
  for (let v = start; v <= max + nice * 0.01; v += nice) ticks.push(Math.round(v));
  return ticks;
}

/** Closing cash: actuals solid, each forecast scenario dashed. One axis, direct labels, hover crosshair. */
export function CashChart({ series, currency, splitPeriod }: { series: Series[]; currency: string; splitPeriod: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const periods = [...new Set(series.flatMap((s) => s.points.map((p) => p.period)))].sort();
  const values = series.flatMap((s) => s.points.map((p) => p.figure.value)).filter((v): v is number => v !== null);
  if (!periods.length || !values.length) return <p className="text-sm text-muted">Not enough data to chart.</p>;
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks.at(-1)!;
  const x = (i: number) => M.l + (i / Math.max(1, periods.length - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - M.t - M.b);
  const idx = new Map(periods.map((p, i) => [p, i]));
  const every = Math.ceil(periods.length / 8);

  // End labels, nudged apart so they never collide.
  const ends = series
    .map((s) => {
      const last = [...s.points].reverse().find((p) => p.figure.value !== null);
      return last ? { s, yy: y(last.figure.value!), xx: x(idx.get(last.period)!) } : null;
    })
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 14) ends[i].yy = ends[i - 1].yy + 14;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * (W - M.l - M.r);
    setHover(Math.max(0, Math.min(periods.length - 1, Math.round((px / (W - M.l - M.r)) * (periods.length - 1)))));
  };

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="22" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "5 3" : undefined} />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Closing cash, actual and forecast by scenario">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#4a3d31" : "#e9dcc5"} strokeWidth={1} />
            <text x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#7a6a58">
              {formatMoney(t, currency, { compact: true })}
            </text>
          </g>
        ))}
        {periods.map((p, i) =>
          i % every === 0 ? (
            <text key={p} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#7a6a58">
              {periodLabel(p).replace(" 20", " ’")}
            </text>
          ) : null,
        )}
        {idx.has(splitPeriod) && (
          <g>
            <line x1={x(idx.get(splitPeriod)!)} x2={x(idx.get(splitPeriod)!)} y1={M.t} y2={H - M.b} stroke="#d9c7a8" strokeDasharray="3 3" />
            <text x={x(idx.get(splitPeriod)!) + 6} y={M.t + 10} fontSize="11" fill="#7a6a58">
              Forecast →
            </text>
          </g>
        )}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.figure.value !== null);
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(idx.get(p.period)!)},${y(p.figure.value!)}`).join(" ");
          return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {ends.map((e) => (
          <g key={e.s.key}>
            <circle cx={e.xx} cy={y(e.s.points.filter((p) => p.figure.value !== null).at(-1)!.figure.value!)} r={3.5} fill={e.s.color} stroke="#fffdf8" strokeWidth={2} />
            <text x={W - M.r + 8} y={e.yy} dy="0.32em" fontSize="11" fill="#2a2019">
              {e.s.label}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="#4a3d31" strokeWidth={1} />
            {series.map((s) => {
              const p = s.points.find((q) => q.period === periods[hover]);
              return p?.figure.value != null ? <circle key={s.key} cx={x(hover)} cy={y(p.figure.value)} r={4} fill={s.color} stroke="#fffdf8" strokeWidth={2} /> : null;
            })}
          </g>
        )}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-8 rounded-lg border border-cream-300 bg-white px-3 py-2 text-xs shadow-card" style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}>
          <p className="mb-1 font-semibold text-ink">{periodLabel(periods[hover])}</p>
          {series.map((s) => {
            const p = s.points.find((q) => q.period === periods[hover]);
            return p ? (
              <p key={s.key} className="flex items-center gap-2 text-ink-soft">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <span className="num font-medium text-ink">{p.figure.value === null ? "—" : formatMoney(p.figure.value, currency)}</span>
                {!p.figure.verified && <span className="font-semibold text-bad">UNVERIFIED</span>}
              </p>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/** Starting MRR, the four movements, and ending MRR as a zero-based waterfall. */
export function MrrWaterfall({ bridge, currency }: { bridge: MrrBridge; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const start = bridge.starting.value ?? 0;
  const steps = [
    { label: "Starting MRR", fig: bridge.starting, kind: "total" as const },
    { label: "New", fig: bridge.new, kind: "up" as const },
    { label: "Expansion", fig: bridge.expansion, kind: "up" as const },
    { label: "Contraction", fig: bridge.contraction, kind: "down" as const },
    { label: "Churn", fig: bridge.churn, kind: "down" as const },
    { label: "Ending MRR", fig: bridge.ending, kind: "total" as const },
  ];
  let running = start;
  const bars = steps.map((s) => {
    const v = s.fig.value ?? 0;
    if (s.kind === "total") return { ...s, from: 0, to: v };
    const from = running;
    running = s.kind === "up" ? running + v : running - v;
    return { ...s, from, to: running };
  });
  const max = Math.max(...bars.map((b) => Math.max(b.from, b.to))) * 1.08 || 1;
  const WW = 760, HH = 280, m = { l: 16, r: 16, t: 28, b: 34 };
  const bw = (WW - m.l - m.r) / bars.length;
  const y = (v: number) => m.t + (1 - v / max) * (HH - m.t - m.b);
  const color = { total: "#7a6a58", up: "#2a78d6", down: "#e34948" };

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft">
        {(["total", "up", "down"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: color[k] }} />
            {k === "total" ? "MRR balance" : k === "up" ? "Increase" : "Decrease"}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${WW} ${HH}`} className="w-full" role="img" aria-label={`MRR bridge for ${periodLabel(bridge.period)}`}>
        <line x1={m.l} x2={WW - m.r} y1={y(0)} y2={y(0)} stroke="#4a3d31" />
        {bars.map((b, i) => {
          const top = y(Math.max(b.from, b.to));
          const h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
          const cx = m.l + i * bw + bw / 2;
          const next = bars[i + 1];
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={m.l + i * bw} y={m.t} width={bw} height={HH - m.t - m.b} fill="transparent" />
              <rect x={cx - bw * 0.3} y={top} width={bw * 0.6} height={h} rx={4} fill={color[b.kind]} opacity={hover === null || hover === i ? 1 : 0.55} />
              {next && next.kind !== "total" && <line x1={cx + bw * 0.3} x2={cx + bw * 0.7} y1={y(b.to)} y2={y(b.to)} stroke="#d9c7a8" strokeDasharray="3 2" />}
              <text x={cx} y={top - 6} textAnchor="middle" fontSize="11.5" fontWeight={600} fill="#2a2019">
                {b.fig.value === null ? "—" : `${b.kind === "up" ? "+" : b.kind === "down" ? "−" : ""}${formatMoney(Math.abs(b.fig.value), currency, { compact: true })}`}
                {!b.fig.verified ? " ⚠" : ""}
              </text>
              <text x={cx} y={HH - 12} textAnchor="middle" fontSize="11" fill="#7a6a58">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-8 rounded-lg border border-cream-300 bg-white px-3 py-2 text-xs shadow-card" style={{ left: `${Math.min(72, (hover / bars.length) * 100)}%` }}>
          <p className="font-semibold text-ink">{bars[hover].label}</p>
          <p className="num text-ink-soft">{bars[hover].fig.value === null ? "—" : formatMoney(bars[hover].fig.value!, currency)}</p>
          <p className="text-muted">{bars[hover].fig.formula}</p>
          {!bars[hover].fig.verified && <p className="font-semibold text-bad">UNVERIFIED</p>}
        </div>
      )}
    </div>
  );
}
