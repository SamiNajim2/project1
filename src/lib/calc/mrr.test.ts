import { describe, expect, it } from "vitest";
import type { MrrRecord, ReconciliationCheck } from "../model";
import { FigureRegistry } from "./figures";
import { buildMrr, grossRetention, mrrEnding, netNewMrr, netRetention } from "./mrr";

describe("MRR bridge maths", () => {
  it("starting + new + expansion − contraction − churn = ending", () => {
    expect(mrrEnding(100_000, 8_000, 3_000, 1_000, 2_500)).toBe(107_500);
    expect(netNewMrr(8_000, 3_000, 1_000, 2_500)).toBe(7_500);
  });

  it("computes monthly retention and handles a zero start", () => {
    expect(grossRetention(100_000, 1_000, 2_500)).toBeCloseTo(96.5);
    expect(netRetention(100_000, 3_000, 1_000, 2_500)).toBeCloseTo(99.5);
    expect(grossRetention(0, 0, 0)).toBeNull();
    expect(netRetention(0, 1, 0, 0)).toBeNull();
  });
});

const cell = (row: number, column: string) => ({ file: "mrr.csv", sheet: "mrr", row, column, columnLetter: "A", raw: 0 });
function record(period: string, row: number, v: Partial<Record<"starting" | "new" | "expansion" | "contraction" | "churn" | "ending", number>>): MrrRecord {
  const sources = Object.fromEntries(Object.keys(v).map((k) => [k, cell(row, k)]));
  return { period, values: v, currency: "USD", sources: { period: cell(row, "month"), ...sources } };
}

describe("MRR bridge with reconciliation", () => {
  it("verifies a bridge that matches the reported ending MRR and carries it into next month", () => {
    const reg = new FigureRegistry();
    const checks: ReconciliationCheck[] = [];
    const [jan, feb] = buildMrr(
      reg,
      [
        record("2026-01", 2, { starting: 100_000, new: 8_000, expansion: 3_000, contraction: 1_000, churn: 2_500, ending: 107_500 }),
        record("2026-02", 3, { new: 5_000, expansion: 1_000, contraction: 500, churn: 1_500, ending: 111_500 }),
      ],
      [],
      "USD",
      checks,
    );
    expect(jan.ending.value).toBe(107_500);
    expect(jan.ending.verified).toBe(true);
    expect(jan.arr.value).toBe(1_290_000);
    // February has no starting MRR column value, so it continues from January's bridge.
    expect(feb.starting.value).toBe(107_500);
    expect(feb.starting.inputs).toEqual([jan.ending.id]);
    expect(feb.ending.value).toBe(111_500);
    expect(checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("flags the month when the reported ending MRR does not reconcile", () => {
    const reg = new FigureRegistry();
    const checks: ReconciliationCheck[] = [];
    const [jan] = buildMrr(reg, [record("2026-01", 2, { starting: 100_000, new: 8_000, expansion: 3_000, contraction: 1_000, churn: 2_500, ending: 107_750 })], [], "USD", checks);
    expect(jan.ending.verified).toBe(false);
    expect(jan.arr.verified).toBe(false); // derived figures inherit the failure
    expect(checks[0]).toMatchObject({ status: "fail", difference: 250 });
  });

  it("flags a starting MRR that does not continue from the previous month", () => {
    const reg = new FigureRegistry();
    const checks: ReconciliationCheck[] = [];
    const [, feb] = buildMrr(
      reg,
      [
        record("2026-01", 2, { starting: 100_000, new: 0, expansion: 0, contraction: 0, churn: 0 }),
        record("2026-02", 3, { starting: 99_000, new: 0, expansion: 0, contraction: 0, churn: 0 }),
      ],
      [],
      "USD",
      checks,
    );
    expect(feb.starting.verified).toBe(false);
    expect(checks.find((c) => c.id.endsWith(".starting"))?.status).toBe("fail");
  });

  it("is unverified when a movement is missing rather than treating it as zero", () => {
    const reg = new FigureRegistry();
    const [jan] = buildMrr(reg, [record("2026-01", 2, { starting: 100_000, new: 1_000, expansion: 0, contraction: 0 })], [], "USD", []);
    expect(jan.churn.value).toBeNull();
    expect(jan.ending.value).toBeNull();
    expect(jan.ending.verified).toBe(false);
  });
});
