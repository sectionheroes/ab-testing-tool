import { describe, expect, it } from "vitest";
import { normalQuantile, rpvMomentsFromOrders, sampleSize } from "../index";

describe("sampleSize CR", () => {
  it("reproduces the textbook figure for 30 % → 40 % at α = 0.05, power = 0.8", () => {
    // Fleiss's normal-approximation formula, worked by hand:
    //   p̄ = 0.35, z = 1.959964, z_power = 0.841621
    //   n = (1.959964·√(2·0.35·0.65) + 0.841621·√(0.3·0.7 + 0.4·0.6))² / 0.01² … = 355.95 → 356
    const r = sampleSize({ metric: "CR", baselineCR: 0.3, mde: 0.1, mdeType: "absolute" });
    expect(r.perVariant).toBe(356);
    expect(r.total).toBe(712);
    expect(r.unit).toBe("visitors");
    expect(r.target).toBeCloseTo(0.4, 12);
  });

  it("reads mde as a relative lift by default", () => {
    const relative = sampleSize({ metric: "CR", baselineCR: 0.02, mde: 0.1 }); // 2 % → 2.2 %
    const absolute = sampleSize({ metric: "CR", baselineCR: 0.02, mde: 0.002, mdeType: "absolute" });
    expect(relative.perVariant).toBe(absolute.perVariant);
    expect(relative.target).toBeCloseTo(0.022, 12);
  });

  it("gets larger as the effect shrinks and as power rises", () => {
    const big = sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0.2 });
    const small = sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0.1 });
    expect(small.perVariant).toBeGreaterThan(big.perVariant);
    const morePower = sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0.1, power: 0.9 });
    expect(morePower.perVariant).toBeGreaterThan(small.perVariant);
    const looserAlpha = sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0.1, alpha: 0.1 });
    expect(looserAlpha.perVariant).toBeLessThan(small.perVariant);
  });

  it("rejects impossible inputs instead of returning a number", () => {
    expect(() => sampleSize({ metric: "CR", baselineCR: 0, mde: 0.1 })).toThrow(/baselineCR/);
    expect(() => sampleSize({ metric: "CR", baselineCR: 0.9, mde: 0.5 })).toThrow(/stay in/);
    expect(() => sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0 })).toThrow(/mde/);
    expect(() => sampleSize({ metric: "CR", baselineCR: 0.03, mde: 0.1, power: 1 })).toThrow(/power/);
  });
});

describe("sampleSize RPV / AOV", () => {
  it("reproduces the classic 'half a standard deviation' figure: 63 per arm", () => {
    // n = 2(z_{0.975} + z_{0.8})² σ² / Δ² = 2·(1.959964 + 0.841621)²·1 / 0.25 = 62.79 → 63
    const r = sampleSize({ metric: "RPV", mean: 10, sd: 1, mde: 0.5, mdeType: "absolute" });
    expect(r.perVariant).toBe(63);
    expect(r.unit).toBe("visitors");
  });

  it("counts AOV on orders, not visitors (4.8)", () => {
    const r = sampleSize({ metric: "AOV", mean: 80, sd: 40, mde: 0.05 });
    expect(r.unit).toBe("orders");
    // Δ = 4 €, σ = 40 € → n = 2·(2.801582)²·1600/16 = 1569.2 → 1570
    expect(r.perVariant).toBe(1570);
  });

  it("scales with the square of the variance ratio", () => {
    const a = sampleSize({ metric: "RPV", mean: 2, sd: 20, mde: 0.1 });
    const b = sampleSize({ metric: "RPV", mean: 2, sd: 40, mde: 0.1 });
    expect(b.perVariant / a.perVariant).toBeCloseTo(4, 1);
  });

  it("uses the exact normal quantiles, not table roundings", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(normalQuantile(0.8)).toBeCloseTo(0.8416212335729143, 12);
  });
});

describe("rpvMomentsFromOrders (plan WP4 variance approximation)", () => {
  it("computes Var(RPV) ≈ CR·E[AOV²] − (CR·AOV)²", () => {
    const amounts = [50, 100, 150];
    const cr = 0.03;
    const r = rpvMomentsFromOrders(cr, amounts);
    const aov = 100;
    const secondMoment = (2_500 + 10_000 + 22_500) / 3;
    expect(r.aov).toBeCloseTo(aov, 12);
    expect(r.mean).toBeCloseTo(cr * aov, 12);
    expect(r.sd).toBeCloseTo(Math.sqrt(cr * secondMoment - (cr * aov) ** 2), 12);
  });

  it("never returns a negative variance", () => {
    expect(rpvMomentsFromOrders(1, [100, 100, 100]).sd).toBeCloseTo(0, 10);
    expect(rpvMomentsFromOrders(0.5, []).sd).toBeNaN();
  });

  it("feeds sampleSize straight through", () => {
    const { mean, sd } = rpvMomentsFromOrders(0.03, [40, 60, 80, 120, 500]);
    const r = sampleSize({ metric: "RPV", mean, sd, mde: 0.1 });
    expect(r.perVariant).toBeGreaterThan(1_000);
    expect(Number.isFinite(r.perVariant)).toBe(true);
  });
});
