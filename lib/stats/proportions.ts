// Two-proportion z-test for conversion rate (contract 4.8, ADR-0018). Pure numbers in, pure numbers out.
import { normalQuantile, normalTwoSidedP } from "./distributions";

export type ProportionArm = {
  /** Visitors in the arm (denominator). */
  n: number;
  /** Converting visitors (numerator) – a visitor with three orders converts once, contract 4.8. */
  conversions: number;
};

export type TwoProportionResult = {
  z: number;
  /** Two-sided p-value. The verdict is always two-sided (4.8: winner or no difference, never "at least as good"). */
  pValue: number;
  /** Conversion rate of the control arm. */
  rateA: number;
  /** Conversion rate of the variant arm. */
  rateB: number;
  /** Pooled rate used in the standard error of the test. */
  pooled: number;
  /** Relative lift (rateB − rateA) / rateA. NaN when the control converted nobody. */
  lift: number;
  /** Confidence interval of the RELATIVE lift. */
  ci: [number, number];
  /** Absolute difference rateB − rateA and its Wald interval, for the UI that wants percentage points. */
  diff: number;
  diffCi: [number, number];
};

/**
 * Pooled two-proportion z-test of H0: p_A = p_B, plus an interval for the relative lift.
 *
 * Test statistic (the textbook form, e.g. OpenStax *Introductory Statistics 2e* §10.3):
 *   z = (p̂_B − p̂_A) / sqrt( p̄(1−p̄) (1/n_A + 1/n_B) ),  p̄ = (x_A + x_B)/(n_A + n_B)
 *
 * CI for the relative lift: the **Katz log method** for a ratio of two binomial proportions
 * (Katz, Baptista, Azen & Pike, "Obtaining confidence intervals for the risk ratio in cohort studies", *Biometrics* 34
 * (1978), 469–474; also Agresti, *Categorical Data Analysis*). The interval is built on ln(p̂_B/p̂_A) with
 *   SE = sqrt( (1−p̂_A)/(n_A p̂_A) + (1−p̂_B)/(n_B p̂_B) )
 * and transformed back with exp(), then shifted by −1 to read as a lift. Deliberately un-pooled: the pooled SE belongs
 * to the null hypothesis, the interval describes the observed ratio. That is standard practice and means the interval
 * may include 0 while the test rejects (and the other way round) in borderline cases – so the verdict comes from
 * `pValue`, never from "does the CI contain 0".
 */
export function twoProportionZTest(a: ProportionArm, b: ProportionArm, opts: { alpha?: number } = {}): TwoProportionResult {
  const alpha = opts.alpha ?? 0.05;
  const rateA = a.n > 0 ? a.conversions / a.n : NaN;
  const rateB = b.n > 0 ? b.conversions / b.n : NaN;
  const pooled = a.n + b.n > 0 ? (a.conversions + b.conversions) / (a.n + b.n) : NaN;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  const z = se > 0 ? (rateB - rateA) / se : NaN;
  const pValue = Number.isFinite(z) ? normalTwoSidedP(z) : NaN;
  const zCrit = normalQuantile(1 - alpha / 2);

  const diff = rateB - rateA;
  const seDiff = Math.sqrt((rateA * (1 - rateA)) / a.n + (rateB * (1 - rateB)) / b.n);
  const diffCi: [number, number] = [diff - zCrit * seDiff, diff + zCrit * seDiff];

  // Katz log method – undefined if either arm has zero conversions, which is exactly when ln(ratio) does not exist.
  let lift = NaN;
  let ci: [number, number] = [NaN, NaN];
  if (a.conversions > 0 && b.conversions > 0) {
    lift = rateB / rateA - 1;
    const seLog = Math.sqrt((1 - rateA) / (a.n * rateA) + (1 - rateB) / (b.n * rateB));
    const logRatio = Math.log(rateB / rateA);
    ci = [Math.exp(logRatio - zCrit * seLog) - 1, Math.exp(logRatio + zCrit * seLog) - 1];
  } else if (a.conversions === 0) {
    lift = b.conversions > 0 ? Infinity : NaN;
  } else {
    lift = -1; // variant converted nobody
  }

  return { z, pValue, rateA, rateB, pooled, lift, ci, diff, diffCi };
}
