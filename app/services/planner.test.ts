/**
 * The planner. Two things are worth pinning here beyond the arithmetic:
 *
 *  1. `revenueInputsFor` is `rpvMomentsFromOrders` written in two moments instead of the raw amounts. The test
 *     asserts the two agree on the same data, so the duplication cannot silently drift.
 *  2. For RPV and AOV the planner is a **floor** (ADR-0036, lib/stats/README.md). The inversion targets
 *     `perVariantConservative`, which carries the measured 71.6 % → 80 % surcharge, so the detectable lift it
 *     reports has to come out *larger* than the naive conversion-rate number at the same budget.
 */
import { describe, expect, it } from "vitest";
import { FUTILITY_DAYS, mdeFromConversions, rpvMomentsFromOrders, sampleSize, visitorsForConversions } from "../../lib/stats";
import { detectableLift, projectRuntime, revenueInputsFor, type OrderStats } from "./planner";

const AMOUNTS = [20, 35, 48, 51, 62, 79, 84, 95, 110, 140, 260, 480];
const stats: OrderStats = {
  orders: AMOUNTS.length,
  aov: AMOUNTS.reduce((s, a) => s + a, 0) / AMOUNTS.length,
  aovSd: Math.sqrt(
    AMOUNTS.reduce((s, a) => s + (a - AMOUNTS.reduce((t, x) => t + x, 0) / AMOUNTS.length) ** 2, 0) / (AMOUNTS.length - 1),
  ),
  secondMoment: AMOUNTS.reduce((s, a) => s + a * a, 0) / AMOUNTS.length,
};

describe("revenueInputsFor", () => {
  it("agrees with rpvMomentsFromOrders on the same data", () => {
    for (const cr of [0.005, 0.024, 0.05, 0.12]) {
      const fromAmounts = rpvMomentsFromOrders(cr, AMOUNTS);
      const fromMoments = revenueInputsFor(cr, stats);
      expect(fromMoments).not.toBeNull();
      expect(fromMoments!.mean).toBeCloseTo(fromAmounts.mean, 10);
      expect(fromMoments!.sd).toBeCloseTo(fromAmounts.sd, 10);
      expect(fromMoments!.aov).toBeCloseTo(fromAmounts.aov, 10);
    }
  });

  it("returns null when there is nothing to plan from", () => {
    expect(revenueInputsFor(0.02, { orders: 0, aov: NaN, aovSd: NaN, secondMoment: NaN })).toBeNull();
    expect(revenueInputsFor(0, stats)).toBeNull();
    expect(revenueInputsFor(1, stats)).toBeNull();
  });
});

describe("detectableLift", () => {
  it("CR is exactly mdeFromConversions – the shop-independent form of ADR-0036", () => {
    const got = detectableLift({ metric: "CR", conversionsPerArm: 1000, baselineCR: 0.024, revenue: stats && revenueInputsFor(0.024, stats) });
    expect(got).not.toBeNull();
    expect(got!.lift).toBeCloseTo(mdeFromConversions({ conversionsPerArm: 1000 }), 12);
    expect(got!.floor).toBe(false);
    // ~12,5 % at 1.000 conversions per arm, which is the number ADR-0036 plans around.
    expect(got!.lift).toBeGreaterThan(0.12);
    expect(got!.lift).toBeLessThan(0.13);
  });

  it("CR needs more conversions for a smaller effect, and the relation is 1/√C", () => {
    const at1000 = detectableLift({ metric: "CR", conversionsPerArm: 1000, baselineCR: 0.024, revenue: null })!.lift;
    const at4000 = detectableLift({ metric: "CR", conversionsPerArm: 4000, baselineCR: 0.024, revenue: null })!.lift;
    expect(at4000).toBeCloseTo(at1000 / 2, 6);
  });

  it("RPV is a floor: the same budget detects a larger effect than the CR figure suggests", () => {
    const cr = 0.024;
    const revenue = revenueInputsFor(cr, stats)!;
    const rpv = detectableLift({ metric: "RPV", conversionsPerArm: 1000, baselineCR: cr, revenue })!;
    const crLift = detectableLift({ metric: "CR", conversionsPerArm: 1000, baselineCR: cr, revenue })!;
    expect(rpv.floor).toBe(true);
    expect(rpv.lift).toBeGreaterThan(crLift.lift);
  });

  it("RPV inverts sampleSize: the returned lift needs about the visitors the conversion target implies", () => {
    const cr = 0.024;
    const conversions = 1000;
    const revenue = revenueInputsFor(cr, stats)!;
    const lift = detectableLift({ metric: "RPV", conversionsPerArm: conversions, baselineCR: cr, revenue })!.lift;
    const budget = visitorsForConversions(conversions, cr);
    const needed = sampleSize({ metric: "RPV", mean: revenue.mean, sd: revenue.sd, mde: lift }).perVariantConservative;
    expect(needed).toBeLessThanOrEqual(budget);
    expect(needed / budget).toBeGreaterThan(0.99); // the bisection sits right at the edge, not far below it
  });

  it("returns null instead of guessing when the inputs are missing", () => {
    expect(detectableLift({ metric: "RPV", conversionsPerArm: 1000, baselineCR: null, revenue: revenueInputsFor(0.02, stats) })).toBeNull();
    expect(detectableLift({ metric: "RPV", conversionsPerArm: 1000, baselineCR: 0.02, revenue: null })).toBeNull();
    expect(detectableLift({ metric: "AOV", conversionsPerArm: 1000, baselineCR: 0.02, revenue: null })).toBeNull();
    expect(detectableLift({ metric: "CR", conversionsPerArm: 0, baselineCR: 0.02, revenue: null })).toBeNull();
  });

  it("AOV plans on orders, and is a floor as well", () => {
    const revenue = revenueInputsFor(0.024, stats)!;
    const aov = detectableLift({ metric: "AOV", conversionsPerArm: 1000, baselineCR: 0.024, revenue })!;
    expect(aov.floor).toBe(true);
    expect(aov.lift).toBeGreaterThan(0);
  });
});

describe("projectRuntime", () => {
  it("rounds up to a full week, because the rule only lets a test end on one", () => {
    // 1.000 conversions at 50 a day = 20 days → the next full week from the start is 21.
    expect(projectRuntime({ conversionsPerArm: 1000, minFullWeeks: 2, convertersPerDay: 50 })).toEqual({ days: 21, weeks: 3, futility: false });
  });

  it("never goes below the minimum runtime", () => {
    expect(projectRuntime({ conversionsPerArm: 10, minFullWeeks: 2, convertersPerDay: 500 })).toEqual({ days: 14, weeks: 2, futility: false });
  });

  it("flags futility past six weeks (ADR-0036)", () => {
    const slow = projectRuntime({ conversionsPerArm: 2500, minFullWeeks: 2, convertersPerDay: 30 })!;
    expect(slow.days).toBeGreaterThan(FUTILITY_DAYS);
    expect(slow.futility).toBe(true);
    expect(projectRuntime({ conversionsPerArm: 1000, minFullWeeks: 6, convertersPerDay: 1000 })!.futility).toBe(false);
  });

  it("returns null without a pace instead of guessing – the first test of a shop has none", () => {
    expect(projectRuntime({ conversionsPerArm: 1000, minFullWeeks: 2, convertersPerDay: null })).toBeNull();
    expect(projectRuntime({ conversionsPerArm: 1000, minFullWeeks: 2, convertersPerDay: 0 })).toBeNull();
  });
});
