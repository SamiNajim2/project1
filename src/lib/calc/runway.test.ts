import { describe, expect, it } from "vitest";
import { projectForecast } from "./forecast";
import { averageNetBurn, cashOutMonth, runwayMonths } from "./runway";

describe("runway", () => {
  it("average net burn is the negative mean of net cash flow", () => {
    expect(averageNetBurn([-100, -200, -300])).toBe(200);
    expect(averageNetBurn([50, 50])).toBe(-50);
    expect(averageNetBurn([])).toBe(0);
  });

  it("runway = current cash ÷ average monthly net burn", () => {
    expect(runwayMonths(1_200_000, 100_000)).toBe(12);
    expect(runwayMonths(1_000_000, 300_000)).toBeCloseTo(3.333, 3);
  });

  it("is not applicable when the business is not burning cash, and zero with no cash", () => {
    expect(runwayMonths(1_000_000, 0)).toBeNull();
    expect(runwayMonths(1_000_000, -5_000)).toBeNull();
    expect(runwayMonths(0, 100)).toBe(0);
    expect(runwayMonths(-10, 100)).toBe(0);
  });

  it("finds the month projected cash first goes negative, interpolated within the month", () => {
    expect(cashOutMonth(250, [-100, -100, -100])).toBeCloseTo(2.5);
    expect(cashOutMonth(300, [-100, -100, -100])).toBeNull(); // exactly zero is not negative
    expect(cashOutMonth(1000, [-100, 50, -100])).toBeNull();
    expect(cashOutMonth(100, [-50, -200])).toBeCloseTo(1.25);
  });
});

describe("forecast projection", () => {
  it("applies growth, margin and opex drivers month by month", () => {
    const months = projectForecast({ revenue: 100_000, opex: 80_000, cash: 1_000_000 }, { revenueGrowthPct: 10, grossMarginPct: 70, opexGrowthPct: 0, otherCashFlow: -5_000 }, 2);
    expect(months[0].revenue).toBeCloseTo(110_000);
    expect(months[0].cogs).toBeCloseTo(33_000);
    expect(months[0].grossProfit).toBeCloseTo(77_000);
    expect(months[0].operatingResult).toBeCloseTo(-3_000);
    expect(months[0].netCashFlow).toBeCloseTo(-8_000);
    expect(months[0].closingCash).toBeCloseTo(992_000);
    expect(months[1].revenue).toBeCloseTo(121_000);
    expect(months[1].closingCash).toBeCloseTo(992_000 + (121_000 * 0.7 - 80_000 - 5_000));
  });
});
