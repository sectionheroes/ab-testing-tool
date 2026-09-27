// Winsorized Welch t-test for revenue per visitor (RPV) and average order value (AOV) – contract 4.8, ADR-0018.
import { studentTQuantile, studentTTwoSidedP } from "./distributions";

export type Samples = number[] | Float64Array;

export type WelchOptions = {
  /**
   * Winsorization quantile, e.g. 0.99 for the 99th percentile required by contract 4.8. The threshold is computed
   * over BOTH arms together and applied to both – computing it per arm would let a single outlier in one arm move
   * that arm's own cap and bias the comparison. Pass `null`/omit for no winsorization.
   */
  winsorize?: number | null;
  alpha?: number;
};

export type Moments = { n: number; mean: number; variance: number };

export type WelchResult = {
  t: number;
  /** Welch–Satterthwaite degrees of freedom, not rounded. */
  df: number;
  /** Two-sided p-value. */
  pValue: number;
  /** meanB − meanA (variant minus control). */
  meanDiff: number;
  /** Confidence interval of meanDiff (absolute, same unit as the samples). */
  ci: [number, number];
  /** Relative lift meanDiff / meanA and its interval, derived from `ci` by dividing by the control mean. */
  lift: number;
  liftCi: [number, number];
  nA: number;
  nB: number;
  meanA: number;
  meanB: number;
  sdA: number;
  sdB: number;
  /** The value both arms were capped at, or null when no winsorization was applied. */
  winsorizedAt: number | null;
};

/**
 * Quickselect (Hoare partition, median-of-three pivot): partially sorts `arr` in place so that arr[k] holds the k-th
 * order statistic and everything left of k is <= it. O(n) instead of the O(n log n) of a full sort – which matters
 * because the A/A Monte-Carlo runs this 10 000 times over 55 000 values.
 */
function selectKth(arr: Float64Array, k: number): number {
  let left = 0;
  let right = arr.length - 1;
  while (left < right) {
    const mid = (left + right) >> 1;
    // median of three, moved to `left`, keeps adversarial (sorted, constant) input from degrading to O(n²)
    if (arr[mid] < arr[left]) [arr[mid], arr[left]] = [arr[left], arr[mid]];
    if (arr[right] < arr[left]) [arr[right], arr[left]] = [arr[left], arr[right]];
    if (arr[right] < arr[mid]) [arr[right], arr[mid]] = [arr[mid], arr[right]];
    const pivot = arr[mid];
    let i = left;
    let j = right;
    while (i <= j) {
      while (arr[i] < pivot) i++;
      while (arr[j] > pivot) j--;
      if (i <= j) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        i++;
        j--;
      }
    }
    if (k <= j) right = j;
    else if (k >= i) left = i;
    else break;
  }
  return arr[k];
}

/**
 * Percentile by linear interpolation between order statistics (the "type 7" definition used by numpy's default
 * `percentile`, R's `quantile(type = 7)` and Excel's PERCENTILE): index = q·(n − 1), interpolated between neighbours.
 * The caller's array is never modified – the selection happens on a copy.
 */
export function percentile(values: Samples, q: number): number {
  const n = values.length;
  if (n === 0) return NaN;
  if (n === 1) return values[0];
  const copy = Float64Array.from(values);
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const atLo = selectKth(copy, lo);
  if (lo === hi) return atLo;
  // After selectKth everything right of `lo` is >= atLo, so the next order statistic is the minimum of that tail.
  let atHi = copy[lo + 1];
  for (let i = lo + 2; i < n; i++) if (copy[i] < atHi) atHi = copy[i];
  return atLo + (pos - lo) * (atHi - atLo);
}

/** Sample mean and unbiased (n−1) variance. */
export function moments(values: Samples): Moments {
  const n = values.length;
  if (n === 0) return { n: 0, mean: NaN, variance: NaN };
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;
  if (n === 1) return { n, mean, variance: 0 };
  // Two-pass, so a large mean with small spread (revenue!) does not lose the variance to cancellation.
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    ss += d * d;
  }
  return { n, mean, variance: ss / (n - 1) };
}

/**
 * Welch's t-test from summary statistics. Kept separate from `welchTTest` because stats.server.ts computes the
 * winsorized moments in SQL (aggregates only, no million-row round trip) and hands them straight in.
 *
 *   t  = (mean_B − mean_A) / sqrt(s²_A/n_A + s²_B/n_B)
 *   df = (s²_A/n_A + s²_B/n_B)² / ( (s²_A/n_A)²/(n_A−1) + (s²_B/n_B)²/(n_B−1) )   (Welch–Satterthwaite)
 */
export function welchTTestFromMoments(a: Moments, b: Moments, opts: WelchOptions = {}): WelchResult {
  const alpha = opts.alpha ?? 0.05;
  const vA = a.variance / a.n;
  const vB = b.variance / b.n;
  const se = Math.sqrt(vA + vB);
  const meanDiff = b.mean - a.mean;
  const df = a.n > 1 && b.n > 1 && vA + vB > 0 ? (vA + vB) ** 2 / (vA ** 2 / (a.n - 1) + vB ** 2 / (b.n - 1)) : NaN;
  const t = se > 0 ? meanDiff / se : NaN;
  const pValue = Number.isFinite(t) && Number.isFinite(df) ? studentTTwoSidedP(t, df) : NaN;
  const tCrit = Number.isFinite(df) ? studentTQuantile(1 - alpha / 2, df) : NaN;
  const ci: [number, number] = [meanDiff - tCrit * se, meanDiff + tCrit * se];
  const lift = a.mean !== 0 ? meanDiff / a.mean : NaN;
  const liftCi: [number, number] = a.mean !== 0 ? [ci[0] / a.mean, ci[1] / a.mean] : [NaN, NaN];
  return {
    t,
    df,
    pValue,
    meanDiff,
    ci,
    lift,
    liftCi,
    nA: a.n,
    nB: b.n,
    meanA: a.mean,
    meanB: b.mean,
    sdA: Math.sqrt(a.variance),
    sdB: Math.sqrt(b.variance),
    winsorizedAt: null,
  };
}

/**
 * Winsorized Welch t-test. `samplesA` is the control arm, `samplesB` the variant.
 *
 * Winsorization is one-sided: values above the quantile are pulled down to it, nothing is touched at the bottom.
 * RPV is a non-negative distribution with a large point mass at 0 (the visitors who did not buy) – a lower cap at the
 * 1st percentile would be a no-op, and clipping upward only is what contract 4.8 means by "winsorized at the 99th
 * percentile". Winsorizing (capping) rather than trimming keeps n, so the denominator of RPV stays "per visitor".
 */
export function welchTTest(samplesA: Samples, samplesB: Samples, opts: WelchOptions = {}): WelchResult {
  const q = opts.winsorize ?? null;
  if (q === null) {
    return welchTTestFromMoments(moments(samplesA), moments(samplesB), opts);
  }
  if (!(q > 0 && q < 1)) throw new Error(`welchTTest: winsorize must be in (0, 1), got ${q}`);

  const combined = new Float64Array(samplesA.length + samplesB.length);
  combined.set(Float64Array.from(samplesA), 0);
  combined.set(Float64Array.from(samplesB), samplesA.length);
  const cap = percentile(combined, q);

  const clip = (values: Samples) => {
    const out = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) out[i] = values[i] > cap ? cap : values[i];
    return out;
  };
  const result = welchTTestFromMoments(moments(clip(samplesA)), moments(clip(samplesB)), opts);
  return { ...result, winsorizedAt: cap };
}
