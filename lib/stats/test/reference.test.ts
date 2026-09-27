/**
 * Reference tests (ADR-0018): every test statistic in lib/stats reproduces at least one PUBLISHED worked example to
 * 4 decimals before it is used anywhere. The expected numbers below are quoted from the source named in each block;
 * each one was additionally re-derived with scipy 1.13.1 as a second source, and that second value is given in the
 * comment where it carries more digits than the publication prints.
 *
 * Sources
 *  - OpenStax, *Introductory Statistics 2e*, §10.3 "Comparing Two Independent Population Proportions", Examples 10.8–10.10
 *    https://openstax.org/books/introductory-statistics-2e/pages/10-3-comparing-two-independent-population-proportions
 *  - OpenStax, *Introductory Statistics 2e*, §11.2 "Goodness-of-Fit Test", Examples 11.2 / 11.3 / 11.4
 *    https://openstax.org/books/introductory-statistics-2e/pages/11-2-goodness-of-fit-test
 *  - NIST/SEMATECH, *e-Handbook of Statistical Methods*, §7.3.1 "Do two processes have the same mean?"
 *    https://www.itl.nist.gov/div898/handbook/prc/section3/prc31.htm
 */
import { describe, expect, it } from "vitest";
import { normalCdf } from "../distributions";
import { srmCheck } from "../srm";
import { twoProportionZTest } from "../proportions";
import { welchTTest } from "../welch";

describe("twoProportionZTest – OpenStax Introductory Statistics 2e §10.3", () => {
  it("Example 10.8 (medication A 20/200 vs B 12/200): z = 1.47, two-tailed p = 0.1404", () => {
    // OpenStax prints the pooled proportion pc = 0.08, z = 1.47 and p-value = 0.1404.
    // scipy second source: z = 1.474420, p = 0.140369. Our arm order is (control, variant) and we compute
    // rateB − rateA, so medication B goes in first to get OpenStax's sign.
    const r = twoProportionZTest({ n: 200, conversions: 12 }, { n: 200, conversions: 20 });
    expect(r.z).toBeCloseTo(1.4744, 4);
    expect(r.pValue).toBeCloseTo(0.1404, 4);
    expect(r.pooled).toBeCloseTo(0.08, 4);
  });

  it("Example 10.9 (seatbelt non-use, women 156/2169 vs men 183/2231): z = -1.256, one-tailed p = 0.1045", () => {
    // scipy second source: z = -1.256491, one-sided p = 0.104469.
    const r = twoProportionZTest({ n: 2231, conversions: 183 }, { n: 2169, conversions: 156 });
    expect(r.z).toBeCloseTo(-1.2565, 4);
    expect(normalCdf(r.z)).toBeCloseTo(0.1045, 4); // OpenStax reports the left tail; our pValue is two-sided
    expect(r.pValue).toBeCloseTo(2 * 0.104469, 4);
    expect(r.pooled).toBeCloseTo(0.077, 3);
  });

  it("Example 10.10 (EV ownership, 134/1343 vs 12/232): z = 2.33", () => {
    // OpenStax prints z = 2.33 and pc = 0.0927 – both reproduced exactly (scipy: z = 2.330481). Its printed p-value
    // of 0.0092 does NOT belong to that z: P(Z > 2.33) = 0.00989, and 0.0092 would need z = 2.3575. We follow the
    // counts, so only the statistic is asserted against the publication here; the p-value comes from Example 10.8/10.9.
    const r = twoProportionZTest({ n: 232, conversions: 12 }, { n: 1343, conversions: 134 });
    expect(r.z).toBeCloseTo(2.3305, 4);
    expect(1 - normalCdf(r.z)).toBeCloseTo(0.00989, 5);
    expect(r.pooled).toBeCloseTo(0.0927, 4);
  });
});

describe("welchTTest – NIST/SEMATECH e-Handbook §7.3.1", () => {
  // Assembly time in minutes. NIST prints N/mean/sd per process and the Welch-Satterthwaite result
  // "t = 2.2694" with "ν = 15.5"; the critical value for the one-sided 5 % test is 1.746 (t table at df = 16).
  // scipy second source: t = 2.269373, df = 15.532514, two-sided p = 0.03787949.
  const process1 = [32, 37, 35, 28, 41, 44, 35, 31, 34, 38, 42];
  const process2 = [36, 31, 30, 31, 34, 36, 29, 32, 31];

  it("reproduces t, df and the summary statistics", () => {
    const r = welchTTest(process2, process1); // (control, variant) – NIST computes mean1 − mean2, so pass process2 first
    expect(r.meanB).toBeCloseTo(36.0909, 4);
    expect(r.sdB).toBeCloseTo(4.9082, 4);
    expect(r.meanA).toBeCloseTo(32.2222, 4);
    expect(r.sdA).toBeCloseTo(2.5386, 4);
    expect(r.t).toBeCloseTo(2.2694, 4);
    expect(r.df).toBeCloseTo(15.5325, 4);
    expect(r.pValue).toBeCloseTo(0.0378795, 7);
    expect(r.meanDiff).toBeCloseTo(3.8687, 4);
  });

  it("without winsorization the samples are used unchanged", () => {
    const r = welchTTest(process2, process1);
    expect(r.winsorizedAt).toBeNull();
    expect(r.nA).toBe(9);
    expect(r.nB).toBe(11);
  });
});

describe("srmCheck (chi-square goodness of fit) – OpenStax Introductory Statistics 2e §11.2", () => {
  it("Example 11.2 (absences by weekday, uniform expectation): χ² = 3, df = 4, p = 0.5578", () => {
    const r = srmCheck([15, 12, 9, 9, 15], [0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(r.chiSquare).toBeCloseTo(3.0, 4);
    expect(r.df).toBe(4);
    expect(r.pValue).toBeCloseTo(0.5578, 4);
    expect(r.expected).toEqual([12, 12, 12, 12, 12]);
    expect(r.alarm).toBe(false);
  });

  it("Example 11.4 (coin pairs 20/57/23 against 25/50/25): χ² = 2.14, df = 2, p = 0.3430", () => {
    const r = srmCheck([20, 57, 23], [0.25, 0.5, 0.25]);
    expect(r.chiSquare).toBeCloseTo(2.14, 4);
    expect(r.df).toBe(2);
    expect(r.pValue).toBeCloseTo(0.343, 4);
  });

  it("Example 11.3 (observed 66/119/340/60/15 against 60/96/330/66/48): χ² = 29.65, df = 4", () => {
    // Expected counts as printed by OpenStax; total 600 on both sides. From those counts the statistic is 29.6464,
    // which OpenStax rounds to 29.65 – scipy on the unrounded value gives p = 5.7764370527e-6.
    const total = 600;
    const r = srmCheck([66, 119, 340, 60, 15], [60 / total, 96 / total, 330 / total, 66 / total, 48 / total]);
    expect(r.chiSquare).toBeCloseTo(29.6464, 4);
    expect(r.chiSquare).toBeCloseTo(29.65, 2); // as printed
    expect(r.df).toBe(4);
    expect(r.pValue).toBeCloseTo(5.7764370527e-6, 12);
    expect(r.alarm).toBe(true); // p < 0.001
  });
});
