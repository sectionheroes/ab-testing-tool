// Sample Ratio Mismatch: chi-square goodness of fit of the observed traffic split against the configured weights.
import { chiSquareUpperP } from "./distributions";

/** Alarm threshold from ADR-0018 / plan WP4. Below this the split is treated as broken, not as bad luck. */
export const SRM_ALARM_P = 0.001;

export type SrmResult = {
  chiSquare: number;
  df: number;
  pValue: number;
  /** true when pValue < 0.001 – the dashboard badge and the snapshot read this. Never auto-stops an experiment. */
  alarm: boolean;
  observed: number[];
  expected: number[];
  total: number;
};

/**
 * Pearson's chi-square goodness-of-fit test, χ² = Σ (O − E)² / E with df = k − 1
 * (OpenStax, *Introductory Statistics 2e* §11.2).
 *
 * `expectedWeights` are the variant weights from the experiment; they are normalised to sum to 1, so both 0.5/0.5 and
 * 50/50 work. Arms with an expected count of 0 (weight 0) are skipped – they contribute nothing and would divide by
 * zero; their df is dropped with them.
 */
export function srmCheck(observedCounts: number[], expectedWeights: number[]): SrmResult {
  if (observedCounts.length !== expectedWeights.length) throw new Error("srmCheck: observed and expected must have the same length");
  const total = observedCounts.reduce((s, n) => s + n, 0);
  const weightSum = expectedWeights.reduce((s, w) => s + w, 0);
  const expected = expectedWeights.map((w) => (weightSum > 0 ? (w / weightSum) * total : 0));

  let chiSquare = 0;
  let cells = 0;
  for (let i = 0; i < observedCounts.length; i++) {
    if (expected[i] <= 0) continue;
    const d = observedCounts[i] - expected[i];
    chiSquare += (d * d) / expected[i];
    cells++;
  }
  const df = Math.max(cells - 1, 0);
  const pValue = df > 0 && total > 0 ? chiSquareUpperP(chiSquare, df) : 1;
  return { chiSquare, df, pValue, alarm: pValue < SRM_ALARM_P, observed: observedCounts, expected, total };
}
