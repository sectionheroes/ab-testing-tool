// Accuracy floor for everything else in lib/stats. Expected values produced with scipy 1.13.1
// (scipy.stats.norm / chi2 / t, scipy.special.gammaln) and asserted to ~1e-12 relative – far tighter than the
// 4 decimals the reference tests in ADR-0018 demand, so a regression here shows up before it reaches a test statistic.
import { describe, expect, it } from "vitest";
import {
  chiSquareUpperP,
  incompleteBeta,
  logGamma,
  normalCdf,
  normalQuantile,
  normalTwoSidedP,
  studentTCdf,
  studentTQuantile,
  studentTTwoSidedP,
} from "../distributions";

const close = (actual: number, expected: number, rel = 1e-12) => {
  if (expected === 0) expect(Math.abs(actual)).toBeLessThan(1e-15);
  else expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(rel);
};

describe("normalCdf / normalQuantile vs scipy.stats.norm", () => {
  // Hart's approximation is accurate in ABSOLUTE terms (~1e-15); its relative accuracy degrades once Φ drops below
  // ~1e-7, hence the looser tolerance on the two deep-tail rows. No p-value we ever report lives down there.
  const cdf: [number, number, number][] = [
    [-8, 6.22096057427174049e-16, 1e-7],
    [-5, 2.86651571879193435e-7, 1e-9],
    [-3, 1.34989803163009306e-3, 1e-11],
    [-1, 1.58655253931457074e-1, 1e-11],
    [-0.5, 3.08537538725986882e-1, 1e-11],
    [0, 5.0e-1, 1e-11],
    [1, 8.41344746068542926e-1, 1e-11],
    [1.4744, 9.29813037768907891e-1, 1e-11],
    [2.33, 9.90096924440835746e-1, 1e-11],
    [3, 9.98650101968369897e-1, 1e-11],
  ];
  it.each(cdf)("Φ(%f)", (x, expected, rel) => close(normalCdf(x), expected, rel));

  const quantile: [number, number, number][] = [
    [1e-10, -6.3613409024040557, 1e-9],
    [1e-5, -4.26489079392282466, 1e-11],
    [0.001, -3.09023230616781319, 1e-11],
    [0.025, -1.95996398454005449, 1e-11],
    [0.1, -1.28155156554460037, 1e-11],
    [0.8, 8.41621233572914296e-1, 1e-11],
    [0.975, 1.95996398454005405, 1e-11],
  ];
  it.each(quantile)("Φ⁻¹(%f)", (p, expected, rel) => close(normalQuantile(p), expected, rel));

  it("round-trips and handles the edges", () => {
    for (const p of [0.01, 0.2, 0.5, 0.9, 0.999]) close(normalCdf(normalQuantile(p)), p, 1e-12);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    expect(normalTwoSidedP(1.95996398454005405)).toBeCloseTo(0.05, 12);
    expect(normalTwoSidedP(0)).toBe(1);
  });
});

describe("chiSquareUpperP vs scipy.stats.chi2.sf", () => {
  const cases: [number, number, number][] = [
    [3, 4, 5.57825400371074753e-1],
    [2.14, 2, 3.43008517418706693e-1],
    [29.65, 4, 5.76670883937047926e-6],
    [0.5, 1, 4.79500122186953370e-1],
    [100, 10, 5.44970198292052153e-17], // the tail is computed directly, not as 1 − cdf
    [1e-3, 3, 9.99991592080941905e-1],
  ];
  it.each(cases)("P(χ²_%f(df=%i) ≥ x)", (x, df, expected) => close(chiSquareUpperP(x, df), expected, 1e-11));
  it("is 1 at and below zero", () => expect(chiSquareUpperP(0, 3)).toBe(1));
});

describe("studentTCdf vs scipy.stats.t", () => {
  const cases: [number, number, number, number][] = [
    [2.269373, 15.532514, 0.9810602568461817, 0.03787948630763646],
    [1.745884, 16, 9.50000028878982383e-1, 9.99999422420351919e-2],
    [-3, 5, 1.50496239487312843e-2, 3.00992478974625687e-2],
    [0.5, 2.5, 6.7115104006514259e-1, 6.5769791986971482e-1],
    [10, 100, 9.99999999999999889e-1, 9.90168898459416381e-17],
  ];
  it.each(cases)("t=%f df=%f", (t, df, cdf, two) => {
    close(studentTCdf(t, df), cdf, 1e-11);
    close(studentTTwoSidedP(t, df), two, 1e-11);
  });

  it("quantiles: the published critical value t(0.95, 16) = 1.746 (NIST 7.3.1)", () => {
    expect(studentTQuantile(0.95, 16)).toBeCloseTo(1.745883676276, 9);
    close(studentTQuantile(0.975, 15.532514), 2.12510260907754844, 1e-9);
  });

  it("approaches the normal for large df", () => {
    close(studentTQuantile(0.975, 1e6), 1.95996635681410658, 1e-8);
    expect(studentTTwoSidedP(1.959963984540054, 1e7)).toBeCloseTo(0.05, 6);
  });
});

describe("logGamma / incompleteBeta", () => {
  it("matches scipy.special.gammaln", () => {
    close(logGamma(0.5), 5.72364942924699971e-1);
    expect(Math.abs(logGamma(1))).toBeLessThan(1e-14);
    close(logGamma(5), 3.17805383034794575);
    close(logGamma(100), 3.59134205369575398e2);
  });
  it("I_x(a,b) is 0 / 1 at the edges and symmetric", () => {
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
    close(incompleteBeta(0.5, 2, 2), 0.5);
    close(incompleteBeta(0.3, 2, 3), 1 - incompleteBeta(0.7, 3, 2));
  });
});
