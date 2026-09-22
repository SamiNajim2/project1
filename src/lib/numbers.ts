import type { RawCell } from "./model";

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "JPY", "INR", "AED", "SGD", "SEK", "NOK", "DKK", "ZAR"] as const;

const SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR" };

export type AmountParse = { value: number; note?: string } | { empty: true } | { error: string };

/**
 * Parses a numeric cell. Formatted text is accepted (currency symbols, thousands separators,
 * accounting negatives) and every conversion returns a note so it can be logged, never silent.
 */
export function parseAmount(value: RawCell, opts: { allowPercent?: boolean } = {}): AmountParse {
  if (value === null) return { empty: true };
  if (typeof value === "number") return Number.isFinite(value) ? { value } : { error: `${value} is not a finite number` };
  if (typeof value === "boolean") return { error: `"${value}" is not a number` };

  const original = value;
  let s = value.trim();
  if (s === "") return { empty: true };
  if (/^[-–—]$/.test(s)) return { value: 0, note: `Read "${original}" as 0 (accounting dash)` };

  let negative = false;
  let percent = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  if (/-$/.test(s) && !/^-/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  s = s.replace(new RegExp(`\\b(${CURRENCIES.join("|")})\\b`, "gi"), "").replace(/[$€£¥₹\s ]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  let normalised: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    normalised = s.replace(/\./g, "").replace(",", "."); // 1.234,56 (European)
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) {
    normalised = s.replace(/,/g, "");
  } else {
    return { error: `"${original}" is not a number` };
  }

  let n = Number(normalised);
  if (!Number.isFinite(n)) return { error: `"${original}" is not a number` };
  if (negative) n = -n;
  if (percent) {
    if (!opts.allowPercent) return { error: `"${original}" is a percentage, not an amount` };
  }
  const plain = String(n) === original.trim();
  return plain ? { value: n } : { value: n, note: `Read "${original}" as ${n}` };
}

/** Finds a currency code or symbol in text such as a header "Amount (USD)" or a value "$1,200". */
export function detectCurrency(text: string): string | null {
  const code = text.toUpperCase().match(new RegExp(`\\b(${CURRENCIES.join("|")})\\b`));
  if (code) return code[1];
  for (const [symbol, iso] of Object.entries(SYMBOLS)) if (text.includes(symbol)) return iso;
  return null;
}

export function isCurrencyCode(text: string): boolean {
  return (CURRENCIES as readonly string[]).includes(text.trim().toUpperCase());
}
