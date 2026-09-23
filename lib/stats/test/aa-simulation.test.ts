/**
 * A/A Monte-Carlo (plan WP4, ADR-0018): 10 000 simulated experiments in which both arms are drawn from the SAME
 * distribution. Under the null hypothesis a test at α = 0.05 must reject about 5 % of the time. The acceptance band
 * is 4–6 % for CR and RPV separately.
 *
 * The band is wide enough to be safe and narrow enough to catch a broken test statistic: at 10 000 runs the standard
 * error of the measured rate is √(0.05·0.95/10 000) ≈ 0.22 pp, so 4 % and 6 % sit ~4.6 standard errors from 5 %. That
 * is why the run count is not negotiable – at 2 000 runs the band would be ~2 SE wide and the test would flake.
 *
 * CLAUDE.md: if the rate lands outside the band, the implementation is wrong. Fix the implementation. Never widen
 * the band, never lower the run count.
 *
 * Runtime is dominated by the RPV arm (it needs the full per-visitor vector for winsorization). Lives in the slow
 * suite: `pnpm test:slow`, run by .github/workflows/ci.yml on every pull request.
 */
import { describe, expect, it } from "vitest";
import { twoProportionZTest, welchTTest } from "../index";
import { Rng } from "./random";

const RUNS = 10_000;
const ALPHA = 0.05;
const MIN_N = 5_000;
const MAX_N = 50_000;
const MIN_CR = 0.02;
const MAX_CR = 0.04;
/** Lognormal AOV: median e^4.2 ≈ 67 €, σ = 0.7 → mean ≈ 85 €, a long right tail like a real shop's order values. */
const AOV_MU = 4.2;
const AOV_SIGMA = 0.7;

/** Wilson-style sanity margin used only in the failure message. */
const pct = (x: number) => `${(x * 100).toFixed(2)} %`;

describe("A/A Monte-Carlo – false-positive rate must be 4–6 %", () => {
  it(
    `CR: ${RUNS} A/A experiments, two-proportion z-test`,
    () => {
      const rng = new Rng(20260922);
      let falsePositives = 0;
      for (let run = 0; run < RUNS; run++) {
        const n = rng.int(MIN_N, MAX_N);
        const cr = MIN_CR + rng.uniform() * (MAX_CR - MIN_CR);
        // Both arms identical: same n, same true CR. Any rejection is a false positive by construction.
        const a = rng.binomial(n, cr);
        const b = rng.binomial(n, cr);
        const { pValue } = twoProportionZTest({ n, conversions: a }, { n, conversions: b });
        if (pValue < ALPHA) falsePositives++;
      }
      const fpr = falsePositives / RUNS;
      console.log(`[A/A] CR   false-positive rate ${pct(fpr)} (${falsePositives}/${RUNS})`);
      expect(fpr, `CR false-positive rate ${pct(fpr)} is outside 4–6 % – the test statistic is wrong, do not widen the band`).toBeGreaterThanOrEqual(0.04);
      expect(fpr).toBeLessThanOrEqual(0.06);
    },
    { timeout: 600_000 },
  );

  it(
    `RPV: ${RUNS} A/A experiments, Welch t-test winsorized at the 99th percentile`,
    () => {
      const rng = new Rng(20260923);
      let falsePositives = 0;
      // Both arms share n and the true CR/AOV distribution; only the draws differ.
      const arm = (n: number, cr: number) => {
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = rng.uniform() < cr ? rng.lognormal(AOV_MU, AOV_SIGMA) : 0;
        return out;
      };
      for (let run = 0; run < RUNS; run++) {
        const n = rng.int(MIN_N, MAX_N);
        const cr = MIN_CR + rng.uniform() * (MAX_CR - MIN_CR);
        const { pValue } = welchTTest(arm(n, cr), arm(n, cr), { winsorize: 0.99 });
        if (pValue < ALPHA) falsePositives++;
      }
      const fpr = falsePositives / RUNS;
      console.log(`[A/A] RPV  false-positive rate ${pct(fpr)} (${falsePositives}/${RUNS})`);
      expect(fpr, `RPV false-positive rate ${pct(fpr)} is outside 4–6 % – the test statistic is wrong, do not widen the band`).toBeGreaterThanOrEqual(0.04);
      expect(fpr).toBeLessThanOrEqual(0.06);
    },
    { timeout: 600_000 },
  );
});
