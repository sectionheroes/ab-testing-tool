import { describe, expect, it } from "vitest";
import { moments, percentile, welchTTest, welchTTestFromMoments } from "../welch";

describe("percentile (type 7, numpy default / R quantile type=7)", () => {
  it("matches numpy.percentile on a known vector", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(v, 0)).toBe(1);
    expect(percentile(v, 1)).toBe(10);
    expect(percentile(v, 0.5)).toBeCloseTo(5.5, 12); // numpy: 5.5
    expect(percentile(v, 0.9)).toBeCloseTo(9.1, 12); // numpy: 9.1
    expect(percentile(v, 0.99)).toBeCloseTo(9.91, 12); // numpy: 9.91
  });
  it("handles degenerate input", () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([42], 0.99)).toBe(42);
  });
  it("does not mutate the caller's array", () => {
    const v = [5, 1, 3];
    percentile(v, 0.5);
    expect(v).toEqual([5, 1, 3]);
  });
});

describe("moments", () => {
  it("uses the unbiased (n−1) variance", () => {
    const m = moments([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(m.mean).toBeCloseTo(5, 12);
    expect(m.variance).toBeCloseTo(32 / 7, 12); // population variance is 4, sample variance is 32/7
    expect(m.n).toBe(8);
  });
  it("is stable for a large mean with small spread", () => {
    const m = moments([1_000_000.1, 1_000_000.2, 1_000_000.3]);
    expect(m.variance).toBeCloseTo(0.01, 10);
  });
});

describe("welchTTest winsorization (contract 4.8)", () => {
  // Control: 99 visitors at 10, one at 10 000. Variant: the same without the outlier.
  const control = [...Array(99).fill(10), 10_000];
  const variant = Array(100).fill(10);

  it("caps at the 99th percentile computed over BOTH arms together", () => {
    const r = welchTTest(control, variant, { winsorize: 0.99 });
    // 200 combined values: 199 tens and one 10 000 → the p99 of the pooled sample is 10.
    expect(r.winsorizedAt).toBeCloseTo(10, 10);
    expect(r.meanA).toBeCloseTo(10, 10);
    expect(r.meanB).toBeCloseTo(10, 10);
    expect(r.meanDiff).toBeCloseTo(0, 10);
  });

  it("keeps n – winsorizing caps, it does not drop visitors", () => {
    const r = welchTTest(control, variant, { winsorize: 0.99 });
    expect(r.nA).toBe(100);
    expect(r.nB).toBe(100);
  });

  it("without winsorization the single outlier dominates the control mean", () => {
    const r = welchTTest(control, variant);
    expect(r.meanA).toBeCloseTo(109.9, 10);
    expect(r.winsorizedAt).toBeNull();
  });

  it("only clips the upper tail – the zeros of non-converting visitors stay zeros", () => {
    const withZeros = [...Array(90).fill(0), ...Array(10).fill(100)];
    const r = welchTTest(withZeros, withZeros, { winsorize: 0.99 });
    expect(r.meanA).toBeCloseTo(10, 10); // 10 × 100 / 100, unchanged: nothing is pulled up off the floor
    expect(r.meanA).toBe(r.meanB);
  });

  it("rejects a quantile outside (0, 1)", () => {
    expect(() => welchTTest([1, 2], [1, 2], { winsorize: 1 })).toThrow(/winsorize/);
    expect(() => welchTTest([1, 2], [1, 2], { winsorize: 0 })).toThrow(/winsorize/);
  });

  it("the moments path gives the same answer as the samples path", () => {
    const a = [1, 5, 2, 8, 3, 9, 4, 7];
    const b = [2, 6, 3, 9, 4, 10, 5, 8];
    const fromSamples = welchTTest(a, b);
    const fromMoments = welchTTestFromMoments(moments(a), moments(b));
    expect(fromMoments.t).toBeCloseTo(fromSamples.t, 12);
    expect(fromMoments.df).toBeCloseTo(fromSamples.df, 12);
    expect(fromMoments.pValue).toBeCloseTo(fromSamples.pValue, 12);
    expect(fromMoments.ci[0]).toBeCloseTo(fromSamples.ci[0], 12);
  });

  it("reports the relative lift interval as the absolute one divided by the control mean", () => {
    const r = welchTTest([10, 12, 8, 11, 9], [14, 16, 12, 15, 13]);
    expect(r.lift).toBeCloseTo(r.meanDiff / r.meanA, 12);
    expect(r.liftCi[0]).toBeCloseTo(r.ci[0] / r.meanA, 12);
    expect(r.liftCi[1]).toBeCloseTo(r.ci[1] / r.meanA, 12);
  });
});
