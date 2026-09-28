// Sample-size planning (plan WP4). Pure numbers – the helper that derives σ from a shop's order history lives in
// app/services/stats.server.ts, because it needs the database.
import { normalQuantile } from "./distributions";

export type MdeType = "relative" | "absolute";

export type SampleSizeCommon = {
  /** Two-sided significance level before any Bonferroni adjustment. Default 0.05. */
  alpha?: number;
  /** Target power. Default 0.8. */
  power?: number;
  /**
   * Minimum detectable effect. "relative" (default) reads as a lift: 0.1 = +10 % on the baseline.
   * "absolute" reads in the unit of the metric: 0.01 = +1 percentage point on CR, 1.50 = +1.50 € on RPV.
   */
  mde: number;
  mdeType?: MdeType;
};

export type SampleSizeInput =
  | ({ metric: "CR"; baselineCR: number } & SampleSizeCommon)
  | ({ metric: "RPV" | "AOV"; mean: number; sd: number } & SampleSizeCommon);

export type SampleSizeResult = {
  /** Required observations per variant – visitors for CR and RPV, orders for AOV (contract 4.8: AOV is order-based). */
  perVariant: number;
  /**
   * For RPV and AOV: `perVariant` with the measured surcharge of `rpvSurcharge()` applied – the number to plan with.
   * `perVariant` alone is a floor, not a promise (see below and lib/stats/README.md). Equal to `perVariant` for CR,
   * where the formula holds.
   */
  perVariantConservative: number;
  /** The factor between the two. 1 for CR. */
  surcharge: number;
  /** perVariant × number of arms, for the two-arm default. */
  total: number;
  metric: "CR" | "RPV" | "AOV";
  unit: "visitors" | "orders";
  alpha: number;
  power: number;
  baseline: number;
  target: number;
  absoluteEffect: number;
};

function effect(baseline: number, mde: number, type: MdeType): number {
  return type === "absolute" ? mde : baseline * mde;
}

/**
 * Sample size per arm for a two-sided test at `alpha` with `power`, two equally sized arms.
 *
 * Proportions – the standard normal-approximation formula with the pooled variance under H0 and the unpooled
 * variance under H1 (Fleiss, *Statistical Methods for Rates and Proportions*, 3rd ed., §4.3):
 *
 *   n = ( z_{1−α/2}·√(2 p̄ (1−p̄)) + z_{power}·√(p₁(1−p₁) + p₂(1−p₂)) )² / (p₂ − p₁)²,   p̄ = (p₁ + p₂)/2
 *
 * Continuous metrics (RPV per visitor, AOV per order) – the two-sample means formula:
 *
 *   n = 2 (z_{1−α/2} + z_{power})² σ² / Δ²
 *
 * Both are the normal approximation; for the n we care about (thousands) the t correction is below the rounding.
 * `arms` above two: pass an already Bonferroni-adjusted `alpha` – evaluate() adjusts the same way.
 */
export function sampleSize(input: SampleSizeInput, arms = 2): SampleSizeResult {
  const alpha = input.alpha ?? 0.05;
  const power = input.power ?? 0.8;
  if (!(alpha > 0 && alpha < 1)) throw new Error(`sampleSize: alpha must be in (0, 1), got ${alpha}`);
  if (!(power > 0 && power < 1)) throw new Error(`sampleSize: power must be in (0, 1), got ${power}`);
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zPower = normalQuantile(power);
  const mdeType = input.mdeType ?? "relative";

  if (input.metric === "CR") {
    const p1 = input.baselineCR;
    if (!(p1 > 0 && p1 < 1)) throw new Error(`sampleSize: baselineCR must be in (0, 1), got ${p1}`);
    const delta = effect(p1, input.mde, mdeType);
    const p2 = p1 + delta;
    if (!(p2 > 0 && p2 < 1)) throw new Error(`sampleSize: baselineCR + mde must stay in (0, 1), got ${p2}`);
    if (delta === 0) throw new Error("sampleSize: mde must not be 0");
    const pBar = (p1 + p2) / 2;
    const n = (zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zPower * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / delta ** 2;
    const perVariant = Math.ceil(n);
    return {
      perVariant,
      perVariantConservative: perVariant,
      surcharge: 1,
      total: perVariant * arms,
      metric: "CR",
      unit: "visitors",
      alpha,
      power,
      baseline: p1,
      target: p2,
      absoluteEffect: delta,
    };
  }

  const { mean, sd } = input;
  if (!(sd > 0)) throw new Error(`sampleSize: sd must be > 0, got ${sd}`);
  const delta = effect(mean, input.mde, mdeType);
  if (delta === 0) throw new Error("sampleSize: mde must not be 0");
  const n = (2 * (zAlpha + zPower) ** 2 * sd ** 2) / delta ** 2;
  const perVariant = Math.ceil(n);
  const surcharge = rpvSurcharge(power);
  return {
    perVariant,
    perVariantConservative: Math.ceil(perVariant * surcharge),
    surcharge,
    total: perVariant * arms,
    metric: input.metric,
    unit: input.metric === "AOV" ? "orders" : "visitors",
    alpha,
    power,
    baseline: mean,
    target: mean + delta,
    absoluteEffect: delta,
  };
}

/**
 * Standard deviation of revenue per visitor, approximated from a shop's order history (plan WP4):
 *
 *   Var(RPV) ≈ CR · E[AOV²] − (CR · E[AOV])²
 *
 * This is the variance of the compound variable "revenue of a visitor" treating it as 0 with probability 1 − CR and
 * as a draw from the order-value distribution with probability CR – i.e. at most one order per visitor. Visitors with
 * two orders make the real variance slightly larger, so the resulting sample size is mildly optimistic; that is the
 * approximation plan WP4 asks for, and the point of the number is planning, not inference.
 *
 * `orderAmounts` are the shop's order values over the reference window (WP4: last 30 days), in shop currency.
 */
export function rpvMomentsFromOrders(cr: number, orderAmounts: number[]): { mean: number; sd: number; aov: number } {
  if (orderAmounts.length === 0) return { mean: NaN, sd: NaN, aov: NaN };
  let sum = 0;
  let sumSq = 0;
  for (const a of orderAmounts) {
    sum += a;
    sumSq += a * a;
  }
  const aov = sum / orderAmounts.length;
  const secondMoment = sumSq / orderAmounts.length;
  const variance = cr * secondMoment - (cr * aov) ** 2;
  return { mean: cr * aov, sd: Math.sqrt(Math.max(variance, 0)), aov };
}

/**
 * The power the RPV/AOV formula above actually delivers at the n it returns, **measured**, not assumed: 71.6 % instead
 * of the 80 % it promises, on zero-inflated lognormal revenue (CR 3 %, μ = 4.2, σ = 0.7). Measured in WP4 and pinned
 * by `test/coverage.test.ts`, which asserts this exact constant – if the implementation drifts, that test fails rather
 * than the surcharge silently going wrong.
 *
 * Two reasons, both inherent to the formula plan WP4 specifies: it assumes the same σ in both arms (a real RPV lift is
 * a bigger basket, so the variant's variance grows with the effect), and `Var(RPV) ≈ CR·E[AOV²] − (CR·AOV)²` allows a
 * visitor at most one order, which understates the variance (ADR-0036).
 */
export const RPV_POWER_AT_PLANNED_N = 0.716;

/**
 * How much to add to the RPV/AOV sample size so it delivers the power it was asked for. **Derived** from
 * `RPV_POWER_AT_PLANNED_N`, not estimated (ADR-0036 explicitly retires the earlier guessed "20–25 %"):
 *
 * For a two-sample mean test, power = Φ(√(n/2)·Δ/σ − z_{1−α/2}), so √(n/2)·Δ/σ = z_{1−α/2} + z_power. The measured
 * power fixes the left-hand side at the n the planner returned; asking for the target power instead scales n by
 *
 *   n₁/n₀ = ( (z_{1−α/2} + z_target) / (z_{1−α/2} + z_measured) )²
 *
 * At α = 0.05, measured 71.6 % and target 80 % that is **1.226** – round up by about 23 %.
 */
export function rpvSurcharge(targetPower = 0.8, alpha = 0.05, measuredPower = RPV_POWER_AT_PLANNED_N): number {
  if (!(targetPower > 0 && targetPower < 1)) throw new Error(`rpvSurcharge: targetPower must be in (0, 1), got ${targetPower}`);
  if (!(measuredPower > 0 && measuredPower < 1)) throw new Error(`rpvSurcharge: measuredPower must be in (0, 1), got ${measuredPower}`);
  if (measuredPower >= targetPower) return 1;
  const zAlpha = normalQuantile(1 - alpha / 2);
  return ((zAlpha + normalQuantile(targetPower)) / (zAlpha + normalQuantile(measuredPower))) ** 2;
}
