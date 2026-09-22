import type { Figure, FigureUnit } from "./model";

export function formatMoney(value: number, currency: string, opts: { compact?: boolean; decimals?: number } = {}): string {
  const abs = Math.abs(value);
  if (opts.compact && abs >= 1000) {
    const [div, suffix] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
    const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: abs / div >= 100 ? 0 : 1 }).format(abs / div);
    return `${value < 0 ? "-" : ""}${currencySymbol(currency)}${n}${suffix}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(value);
}

export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? `${currency} `
    );
  } catch {
    return `${currency} `;
  }
}

export function formatPercent(value: number, decimals = 1, signed = false): string {
  const s = `${value.toFixed(decimals)}%`;
  return signed && value > 0 ? `+${s}` : s;
}

export function formatMonths(value: number): string {
  return `${value.toFixed(1)} months`;
}

export function formatNumber(value: number, unit: FigureUnit, currency: string, opts: { compact?: boolean; signed?: boolean } = {}): string {
  switch (unit) {
    case "currency": {
      const s = formatMoney(value, currency, { compact: opts.compact });
      return opts.signed && value > 0 ? `+${s}` : s;
    }
    case "percent":
      return formatPercent(value, 1, opts.signed);
    case "months":
      return formatMonths(value);
    case "ratio":
      return `${value.toFixed(2)}×`;
  }
}

/** Display text for a figure; "n/a" when not applicable, "—" when missing. */
export function formatFigure(f: Figure | undefined, currency: string, opts: { compact?: boolean; signed?: boolean } = {}): string {
  if (!f) return "—";
  if (f.value === null) return f.note ?? (f.verified ? "n/a" : "—");
  return formatNumber(f.value, f.unit, currency, opts);
}

/** Rounds away floating-point noise so reconciliation compares money, not binary fractions. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
