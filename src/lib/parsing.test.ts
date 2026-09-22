import { describe, expect, it } from "vitest";
import type { Figure } from "./model";
import { checkNarrative, toSegments } from "./narrative/tokens";
import { parseAmount } from "./numbers";
import { parsePeriod, ytdPeriods } from "./periods";

describe("period parsing", () => {
  it.each([
    ["2026-06", "2026-06"],
    ["2026-06-30", "2026-06"],
    ["Jun-26", "2026-06"],
    ["June 2026", "2026-06"],
    ["30/06/2026", "2026-06"],
    ["06/30/2026", "2026-06"],
    ["06/2026", "2026-06"],
  ])("%s → %s", (input, expected) => {
    const p = parsePeriod(input);
    expect("period" in p && p.period).toBe(expected);
  });

  it("reads Excel serial dates and notes the interpretation", () => {
    const p = parsePeriod(46203); // 2026-06-30
    expect(p).toMatchObject({ period: "2026-06" });
    expect("note" in p && p.note).toMatch(/serial/);
  });

  it("flags ambiguous day/month order instead of guessing silently", () => {
    const p = parsePeriod("05/06/2026");
    expect("note" in p && p.note).toMatch(/ambiguous/);
  });

  it("rejects quarterly and unrecognisable periods", () => {
    expect(parsePeriod("Q2 2026")).toHaveProperty("error");
    expect(parsePeriod("soon")).toHaveProperty("error");
  });

  it("builds fiscal year-to-date months", () => {
    expect(ytdPeriods("2026-06", 1)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(ytdPeriods("2026-02", 4)).toHaveLength(11); // FY starting April
  });
});

describe("amount parsing", () => {
  it("accepts numbers unchanged", () => expect(parseAmount(1234.5)).toEqual({ value: 1234.5 }));
  it("converts formatted text and says so", () => {
    expect(parseAmount("$1,234.50")).toMatchObject({ value: 1234.5 });
    expect(parseAmount("(1,234)")).toMatchObject({ value: -1234 });
    expect(parseAmount("1.234,56")).toMatchObject({ value: 1234.56 });
    expect(parseAmount("-")).toMatchObject({ value: 0 });
    expect((parseAmount("(1,234)") as { note: string }).note).toMatch(/Read/);
  });
  it("treats blanks as empty and rejects text", () => {
    expect(parseAmount("")).toEqual({ empty: true });
    expect(parseAmount(null)).toEqual({ empty: true });
    expect(parseAmount("n/a")).toHaveProperty("error");
    expect(parseAmount("5%")).toHaveProperty("error");
    expect(parseAmount("5%", { allowPercent: true })).toMatchObject({ value: 5 });
  });
});

describe("narrative guard", () => {
  const fig = (id: string, value: number, verified = true): Figure => ({ id, label: id, value, unit: "currency", kind: "actual", formula: "", inputs: [], sources: [], verified, reasons: verified ? [] : ["x"] });
  const figures = { rev: fig("rev", 1_250_000), cash: fig("cash", 5_000_000, false) };

  it("substitutes verified figures and flags numbers the model typed", () => {
    const segs = toSegments("Revenue was {{F:rev}} in Q2 2026, up 12% on last year.", figures, "USD");
    expect(segs.find((s) => s.t === "fig")).toMatchObject({ id: "rev", verified: true });
    expect(segs.filter((s) => s.t === "flag").map((s) => s.text.trim())).toEqual(["12%"]);
  });

  it("reports literal numbers, unverified or unknown figures, and causal language", () => {
    const flags = checkNarrative(
      [{ heading: "Summary", paragraphs: ["Cash was {{F:cash}}, margin improved 3 points because of pricing.", "See {{F:nope}}."], bullets: [] }],
      figures,
      false,
    );
    expect(flags.map((f) => f.reason).sort()).toEqual(["causal_claim", "number_not_from_figure", "unknown_figure", "unverified_figure"]);
  });
});
