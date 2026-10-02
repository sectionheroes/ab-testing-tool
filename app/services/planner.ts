/**
 * The arithmetic behind the "When is it decided?" card — pure, so it is unit-tested without a database and the form
 * can show the numbers update while you type.
 *
 * The calculator runs **one way only** here (Joel, 01.10.): you enter conversions per variant and the detectable
 * lift is derived from it. `lib/stats` still translates in both directions (`conversionsForMde` ↔
 * `mdeFromConversions`) and keeps doing so for the CLI — the UI simply never offers the other direction.
 *
 * No new formula lives in this file. For CR it is `mdeFromConversions` straight out of lib/stats; for RPV and AOV it
 * numerically **inverts** `sampleSize()`, which is the tested function, instead of restating its algebra here. That
 * also means the RPV surcharge comes along for free: the inversion targets `perVariantConservative`, the number that
 * already carries the measured 71.6 % → 80 % correction (ADR-0036, lib/stats/README.md).
 */
import { FUTILITY_DAYS, mdeFromConversions, sampleSize, visitorsForConversions } from "../../lib/stats";
import type { MetricKey } from "./experiment-input";

export type RevenueInputs = {
  /** Revenue per visitor: mean and σ from the shop's own recent orders (`rpvPlanningInputs`). */
  mean: number;
  sd: number;
  /** Average order value and its σ, for the AOV metric (order-based, 4.8). */
  aov: number;
  aovSd: number;
};

export type DetectableLift = {
  /** Relative lift, e.g. 0.125 for +12,5 %. */
  lift: number;
  /**
   * True for RPV and AOV: the planner is a floor, not a promise — the real test is weaker than the figure says
   * (ADR-0036). The UI has to say so rather than print the number bare.
   */
  floor: boolean;
};

/**
 * The smallest relative effect `conversionsPerArm` converting visitors per arm can detect at 80 % power.
 *
 * Returns null when the inputs for the metric are missing — no baseline conversion rate for RPV, no order history
 * for RPV/AOV. The card then shows a dash instead of a guess.
 */
export function detectableLift(opts: {
  metric: MetricKey;
  conversionsPerArm: number;
  baselineCR: number | null;
  revenue: RevenueInputs | null;
  alpha?: number;
  power?: number;
}): DetectableLift | null {
  const { metric, conversionsPerArm, baselineCR, revenue } = opts;
  if (!(conversionsPerArm > 0)) return null;

  if (metric === "CR") {
    return { lift: mdeFromConversions({ conversionsPerArm, alpha: opts.alpha, power: opts.power }), floor: false };
  }

  if (!revenue) return null;

  if (metric === "AOV") {
    // AOV is per order (4.8). A converting visitor buys at least once, so the conversion target is also the order
    // floor — the approximation errs towards fewer orders, i.e. a larger (more cautious) detectable lift.
    if (!(revenue.aov > 0 && revenue.aovSd > 0)) return null;
    const lift = invertSampleSize(conversionsPerArm, (mde) =>
      sampleSize({ metric: "AOV", mean: revenue.aov, sd: revenue.aovSd, mde, alpha: opts.alpha, power: opts.power }).perVariantConservative,
    );
    return lift === null ? null : { lift, floor: true };
  }

  // RPV is per visitor, so the conversion target has to be translated through the baseline conversion rate.
  if (baselineCR === null || !(baselineCR > 0 && baselineCR < 1)) return null;
  if (!(revenue.mean > 0 && revenue.sd > 0)) return null;
  const visitors = visitorsForConversions(conversionsPerArm, baselineCR);
  const lift = invertSampleSize(visitors, (mde) =>
    sampleSize({ metric: "RPV", mean: revenue.mean, sd: revenue.sd, mde, alpha: opts.alpha, power: opts.power }).perVariantConservative,
  );
  return lift === null ? null : { lift, floor: true };
}

/**
 * Smallest `mde` whose required sample size still fits into `budget`. `n(mde)` falls monotonically in `mde`, so a
 * bisection converges; 60 steps over (1e-5, 10) land far below the rounding of a displayed percentage.
 */
function invertSampleSize(budget: number, n: (mde: number) => number): number | null {
  if (!(budget > 0)) return null;
  let lo = 1e-5; // n(lo) is astronomically large
  let hi = 10; // +1000 %: n(hi) is tiny
  if (n(hi) > budget) return null; // not even a tenfold effect is detectable with this budget
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (n(mid) > budget) lo = mid;
    else hi = mid;
  }
  return hi;
}

export type RuntimeProjection = {
  /** Calendar days from the start, already rounded up to a full week (ADR-0036: the UI only offers whole weeks). */
  days: number;
  weeks: number;
  /** More than six weeks: the futility warning of ADR-0036. A warning, never a block and never an auto-stop. */
  futility: boolean;
};

/**
 * How long the test would take **at the pace of the last test in this shop**. That caveat is part of the label in
 * the UI, not a footnote: a different targeting means a different number of visitors per day, and then this is
 * simply wrong. Returns null when there is no pace yet — the first test of a shop gets an empty field, never a guess
 * (ADR-0036, plan WP5a).
 */
export function projectRuntime(opts: {
  conversionsPerArm: number;
  minFullWeeks: number;
  /** Converting visitors per day in the slower arm of the shop's last test. */
  convertersPerDay: number | null;
}): RuntimeProjection | null {
  const { conversionsPerArm, minFullWeeks, convertersPerDay } = opts;
  if (convertersPerDay === null || !(convertersPerDay > 0) || !(conversionsPerArm > 0)) return null;
  const daysForConversions = Math.ceil(conversionsPerArm / convertersPerDay);
  const raw = Math.max(daysForConversions, Math.max(minFullWeeks, 1) * 7);
  const days = Math.ceil(raw / 7) * 7; // the rule only lets the test end on a full week from the start day
  return { days, weeks: days / 7, futility: days > FUTILITY_DAYS };
}

export type OrderStats = {
  /** Counting orders in the reference window (4.8). 0 means the shop has no history to plan from. */
  orders: number;
  aov: number;
  aovSd: number;
  /** E[AOV²] over the same window – everything σ(RPV) needs besides the conversion rate. */
  secondMoment: number;
};

/**
 * σ and the mean of revenue per visitor for a conversion rate the user may still be typing.
 *
 * This is `rpvMomentsFromOrders` from lib/stats expressed in the two moments instead of the raw amounts, so the form
 * can recompute it in the browser without downloading a month of order values. `planner.test.ts` asserts the two
 * agree on the same data; if the approximation in lib/stats ever changes, that test fails here.
 */
export function revenueInputsFor(cr: number, stats: OrderStats): RevenueInputs | null {
  if (!(stats.orders > 0) || !Number.isFinite(stats.aov) || !(cr > 0 && cr < 1)) return null;
  const variance = cr * stats.secondMoment - (cr * stats.aov) ** 2;
  return { mean: cr * stats.aov, sd: Math.sqrt(Math.max(variance, 0)), aov: stats.aov, aovSd: stats.aovSd };
}
