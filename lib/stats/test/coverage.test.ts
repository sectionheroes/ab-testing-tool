/**
 * The confidence interval for the relative lift and the sample-size formulas are checked by the property they claim,
 * not against a third party's rounding:
 *
 *  - a 95 % interval must cover the true lift about 95 % of the time,
 *  - the n that `sampleSize()` returns must really deliver about 80 % power at the effect it was asked for.
 *
 * Both are seeded, so the numbers are fixed. The bands are wide enough for the run counts below (2 000 runs →
 * SE ≈ 0.5 pp for coverage, ≈ 0.9 pp for power) and narrow enough that a wrong formula fails.
 */
import { describe, expect, it } from "vitest";
import { sampleSize, twoProportionZTest, welchTTest } from "../index";
import { Rng } from "./random";

const RUNS = 2_000;

describe("CI coverage", () => {
  it("the Katz interval for the relative CR lift covers the truth ~95 % of the time", () => {
    const rng = new Rng(4711);
    const baseline = 0.03;
    const trueLift = 0.15;
    const variantRate = baseline * (1 + trueLift);
    let covered = 0;
    for (let run = 0; run < RUNS; run++) {
      const n = rng.int(10_000, 40_000);
      const r = twoProportionZTest(
        { n, conversions: rng.binomial(n, baseline) },
        { n, conversions: rng.binomial(n, variantRate) },
      );
      if (r.ci[0] <= trueLift && trueLift <= r.ci[1]) covered++;
    }
    const rate = covered / RUNS;
    console.log(`[coverage] CR relative-lift CI ${(rate * 100).toFixed(2)} %`);
    expect(rate).toBeGreaterThan(0.93);
    expect(rate).toBeLessThan(0.97);
  });

  it("the Welch interval for the absolute RPV difference covers the truth ~95 % of the time", () => {
    const rng = new Rng(1234);
    const cr = 0.03;
    const mu = 4.2;
    const sigma = 0.7;
    const liftFactor = 1.1;
    // Mean of a lognormal is exp(mu + sigma²/2); the arms differ by the factor above, applied to the order value.
    const meanOrder = Math.exp(mu + (sigma * sigma) / 2);
    const trueDiff = cr * meanOrder * (liftFactor - 1);
    const arm = (n: number, factor: number) => {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = rng.uniform() < cr ? factor * rng.lognormal(mu, sigma) : 0;
      return out;
    };
    let covered = 0;
    for (let run = 0; run < RUNS; run++) {
      const n = rng.int(20_000, 40_000);
      // No winsorization here: winsorizing shifts the estimand away from the true mean by design, so a coverage
      // check of the mean difference has to look at the unmodified estimator.
      const r = welchTTest(arm(n, 1), arm(n, liftFactor));
      if (r.ci[0] <= trueDiff && trueDiff <= r.ci[1]) covered++;
    }
    const rate = covered / RUNS;
    console.log(`[coverage] RPV mean-difference CI ${(rate * 100).toFixed(2)} %`);
    expect(rate).toBeGreaterThan(0.93);
    expect(rate).toBeLessThan(0.97);
  }, 120_000);
});

describe("sampleSize delivers the power it promises", () => {
  it("CR: the returned n rejects at ~80 % when the effect is exactly the MDE", () => {
    const baseline = 0.03;
    const mde = 0.15;
    const { perVariant } = sampleSize({ metric: "CR", baselineCR: baseline, mde });
    const variantRate = baseline * (1 + mde);
    const rng = new Rng(20260923);
    let rejected = 0;
    for (let run = 0; run < RUNS; run++) {
      const { pValue } = twoProportionZTest(
        { n: perVariant, conversions: rng.binomial(perVariant, baseline) },
        { n: perVariant, conversions: rng.binomial(perVariant, variantRate) },
      );
      if (pValue < 0.05) rejected++;
    }
    const power = rejected / RUNS;
    console.log(`[power] CR n=${perVariant} per arm → ${(power * 100).toFixed(2)} %`);
    expect(power).toBeGreaterThan(0.77);
    expect(power).toBeLessThan(0.83);
  }, 120_000);

  it("RPV/AOV: the returned n rejects at ~80 % on the problem the formula actually describes", () => {
    // n = 2(z + z_power)²σ²/Δ² assumes both arms have the same σ. Checked here on exactly that: two normal samples,
    // equal variance, mean apart by the MDE.
    const mean = 2.5;
    const sd = 20;
    const mde = 0.1;
    const { perVariant } = sampleSize({ metric: "RPV", mean, sd, mde });
    const rng = new Rng(555);
    const arm = (n: number, m: number) => {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = m + sd * rng.normal();
      return out;
    };
    let rejected = 0;
    const runs = 600; // n is six figures here; 600 runs give SE ≈ 1.6 pp and keep the default suite quick
    for (let run = 0; run < runs; run++) {
      if (welchTTest(arm(perVariant, mean), arm(perVariant, mean * (1 + mde))).pValue < 0.05) rejected++;
    }
    const power = rejected / runs;
    console.log(`[power] RPV normal, equal variance, n=${perVariant} per arm → ${(power * 100).toFixed(2)} %`);
    expect(power).toBeGreaterThan(0.75);
    expect(power).toBeLessThan(0.85);
  }, 120_000);

  it("documents how much power that same n really has on zero-inflated lognormal revenue", () => {
    // A real RPV lift is a bigger basket, not a shifted normal: the variant's variance grows with the effect, so the
    // equal-variance assumption of the formula is optimistic. plan WP4 already calls the variance approximation
    // optimistic for a second reason (it assumes at most one order per visitor). This test pins the size of the gap
    // instead of pretending it is not there – it is a planning number, not an inference number.
    const rng = new Rng(99);
    const cr = 0.03;
    const mu = 4.2;
    const sigma = 0.7;
    const secondMoment = Math.exp(2 * mu + 2 * sigma * sigma);
    const meanOrder = Math.exp(mu + (sigma * sigma) / 2);
    const mean = cr * meanOrder;
    const sd = Math.sqrt(cr * secondMoment - mean * mean);
    const mde = 0.1;
    const { perVariant } = sampleSize({ metric: "RPV", mean, sd, mde });

    const arm = (n: number, factor: number) => {
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = rng.uniform() < cr ? factor * rng.lognormal(mu, sigma) : 0;
      return out;
    };
    let rejected = 0;
    const runs = 500; // n is large here; 500 runs give SE ≈ 2 pp
    for (let run = 0; run < runs; run++) {
      if (welchTTest(arm(perVariant, 1), arm(perVariant, 1 + mde)).pValue < 0.05) rejected++;
    }
    const power = rejected / runs;
    console.log(`[power] RPV lognormal, n=${perVariant} per arm → ${(power * 100).toFixed(2)} % (documented shortfall)`);
    // Wide band on purpose: this records a known shortfall, it is not a target. If it ever climbs to 80 % or falls
    // below 60 %, something about the model or the formula changed and the README needs rewriting.
    expect(power).toBeGreaterThan(0.6);
    expect(power).toBeLessThan(0.8);
  }, 120_000);
});
