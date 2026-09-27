// The rules of contract 4.8 and plan WP4, each one as its own assertion.
import { describe, expect, it } from "vitest";
import { STATS_VERSION, evaluate, guardrail, type VariantStats } from "../index";

const arm = (key: string, isControl: boolean, over: Partial<VariantStats> = {}): VariantStats => ({
  key,
  isControl,
  weight: 0.5,
  visitors: 10_000,
  converters: 300,
  orders: 320,
  revenue: 24_000,
  ...over,
});

const base = { primaryMetric: "CR" as const, plannedSampleSize: 5_000 };

describe("significance – the hard rule (plan WP4, CLAUDE.md)", () => {
  it("is false below plannedSampleSize even at p < 0.001", () => {
    // 200/2000 vs 320/2000 is a crushing difference: p is far below 0.001.
    const variants = [arm("a", true, { visitors: 2_000, converters: 200 }), arm("b", false, { visitors: 2_000, converters: 320 })];
    const below = evaluate({ ...base, plannedSampleSize: 5_000 }, variants, STATS_VERSION);
    expect(below.variants[1].pValue!).toBeLessThan(0.001);
    expect(below.sampleSizeReached).toBe(false);
    expect(below.variants[1].significant).toBe(false);
    expect(below.significant).toBe(false);
    expect(below.winner).toBeNull();

    // Same data, but now the plan says 2 000 per variant – identical p-value, now significant.
    const reached = evaluate({ ...base, plannedSampleSize: 2_000 }, variants, STATS_VERSION);
    expect(reached.variants[1].pValue).toBe(below.variants[1].pValue);
    expect(reached.sampleSizeReached).toBe(true);
    expect(reached.variants[1].significant).toBe(true);
    expect(reached.winner).toBe("b");
  });

  it("is false without a plannedSampleSize, whatever the data says", () => {
    const r = evaluate(
      { ...base, plannedSampleSize: null },
      [arm("a", true, { visitors: 50_000, converters: 1_000 }), arm("b", false, { visitors: 50_000, converters: 2_000 })],
      STATS_VERSION,
    );
    expect(r.variants[1].pValue!).toBeLessThan(1e-20);
    expect(r.sampleSizeReached).toBe(false);
    expect(r.significant).toBe(false);
    expect(r.warnings.some((w) => w.includes("no plannedSampleSize"))).toBe(true);
  });

  it("needs EVERY arm to reach the planned size, not just one", () => {
    const r = evaluate(base, [arm("a", true, { visitors: 9_000 }), arm("b", false, { visitors: 4_000, converters: 180 })], STATS_VERSION);
    expect(r.sampleSizeReached).toBe(false);
    expect(r.variants[1].significant).toBe(false);
  });
});

describe("verdict scope (4.8)", () => {
  it("gives a p-value to the primary metric only; secondary metrics get estimate + CI", () => {
    const rpvSamples = (n: number, converters: number, value: number) =>
      Float64Array.from({ length: n }, (_, i) => (i < converters ? value : 0));
    const variants = [
      arm("a", true, { rpvSamples: rpvSamples(10_000, 300, 80) }),
      arm("b", false, { converters: 340, revenue: 27_200, rpvSamples: rpvSamples(10_000, 340, 80) }),
    ];
    const cr = evaluate({ ...base, primaryMetric: "CR" }, variants, STATS_VERSION);
    expect(cr.variants[1].metrics.CR.pValue).not.toBeNull();
    expect(cr.variants[1].metrics.RPV.pValue).toBeNull();
    expect(cr.variants[1].metrics.AOV.pValue).toBeNull();
    expect(cr.variants[1].metrics.RPV.ci).not.toBeNull(); // estimator + interval, just no verdict

    const rpv = evaluate({ ...base, primaryMetric: "RPV" }, variants, STATS_VERSION);
    expect(rpv.variants[1].metrics.RPV.pValue).not.toBeNull();
    expect(rpv.variants[1].metrics.CR.pValue).toBeNull();
    expect(rpv.variants[1].pValue).toBe(rpv.variants[1].metrics.RPV.pValue);
  });

  it("control carries no lift, no CI and no p-value", () => {
    const r = evaluate(base, [arm("a", true), arm("b", false)], STATS_VERSION);
    expect(r.variants[0].lift).toBeNull();
    expect(r.variants[0].ci).toBeNull();
    expect(r.variants[0].pValue).toBeNull();
    expect(r.variants[0].significant).toBe(false);
  });

  it("applies Bonferroni from three variants on, not at two", () => {
    const two = evaluate(base, [arm("a", true), arm("b", false)], STATS_VERSION);
    expect(two.comparisons).toBe(1);
    expect(two.alphaAdjusted).toBe(0.05);

    const three = evaluate(
      base,
      [arm("a", true, { weight: 1 / 3 }), arm("b", false, { weight: 1 / 3 }), arm("c", false, { weight: 1 / 3 })],
      STATS_VERSION,
    );
    expect(three.comparisons).toBe(2);
    expect(three.alphaAdjusted).toBe(0.025);
  });

  it("picks the best significant variant as winner", () => {
    const r = evaluate(
      { primaryMetric: "CR", plannedSampleSize: 10_000 },
      [
        arm("a", true, { weight: 1 / 3, converters: 300 }),
        arm("b", false, { weight: 1 / 3, converters: 420 }),
        arm("c", false, { weight: 1 / 3, converters: 380 }),
      ],
      STATS_VERSION,
    );
    expect(r.variants[1].significant).toBe(true);
    expect(r.winner).toBe("b");
  });
});

describe("counting rules", () => {
  it("CR uses converting visitors, not orders", () => {
    const r = evaluate(base, [arm("a", true, { converters: 300, orders: 450 }), arm("b", false)], STATS_VERSION);
    expect(r.variants[0].cr).toBeCloseTo(0.03, 10); // 300/10000, not 450/10000
    expect(r.variants[0].orders).toBe(450);
  });

  it("clamps converters to visitors and says so (ADR-0032)", () => {
    const r = evaluate(base, [arm("a", true, { visitors: 1_000, converters: 1_200 }), arm("b", false)], STATS_VERSION);
    expect(r.variants[0].converters).toBe(1_000);
    expect(r.variants[0].cr).toBe(1);
    expect(r.warnings.some((w) => w.includes("clamped"))).toBe(true);
  });

  it("AOV is revenue per order, RPV is revenue per visitor", () => {
    const r = evaluate(base, [arm("a", true, { visitors: 1_000, orders: 50, revenue: 5_000 }), arm("b", false)], STATS_VERSION);
    expect(r.variants[0].rpv).toBeCloseTo(5, 10);
    expect(r.variants[0].aov).toBeCloseTo(100, 10);
  });

  it("carries window, tainted days and bot share into the output", () => {
    const r = evaluate(
      {
        ...base,
        window: { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-15T00:00:00Z") },
        taintedDays: ["2026-10-03"],
      },
      [arm("a", true, { botVisitors: 500 }), arm("b", false, { botVisitors: 500 })],
      STATS_VERSION,
    );
    expect(r.window).toEqual({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" });
    expect(r.taintedDays).toEqual(["2026-10-03"]);
    expect(r.botShare).toBeCloseTo(1_000 / 21_000, 10);
    expect(r.statsVersion).toBe(STATS_VERSION);
  });
});

describe("byDevice", () => {
  const device = (visitors: number, converters: number, orders: number, revenue: number) => ({ visitors, converters, orders, revenue });

  it("sums to the totals and repeats the same figures per device", () => {
    const variants: VariantStats[] = [
      arm("a", true, {
        visitors: 1_000,
        converters: 30,
        orders: 32,
        revenue: 2_400,
        byDevice: { mobile: device(600, 18, 19, 1_400), desktop: device(350, 10, 11, 800), tablet: device(50, 2, 2, 200) },
      }),
      arm("b", false, {
        visitors: 1_000,
        converters: 40,
        orders: 42,
        revenue: 3_200,
        byDevice: { mobile: device(600, 24, 25, 1_900), desktop: device(350, 14, 15, 1_100), tablet: device(50, 2, 2, 200) },
      }),
    ];
    const r = evaluate({ ...base, plannedSampleSize: 1_000 }, variants, STATS_VERSION);
    for (const v of r.variants) {
      const sum = (pick: (d: { visitors: number; converters: number; orders: number; revenue: number }) => number) =>
        pick(v.byDevice.mobile) + pick(v.byDevice.desktop) + pick(v.byDevice.tablet);
      expect(sum((d) => d.visitors)).toBe(v.visitors);
      expect(sum((d) => d.converters)).toBe(v.converters);
      expect(sum((d) => d.orders)).toBe(v.orders);
      expect(sum((d) => d.revenue)).toBe(v.revenue);
      expect(v.warnings).toEqual([]);
    }
    expect(r.variants[1].byDevice.mobile.cr).toBeCloseTo(0.04, 10);
    expect(r.variants[1].byDevice.mobile.metrics.CR.pValue).not.toBeNull(); // per-device p-values are in the snapshot
  });

  it("warns when the device split does not add up", () => {
    const r = evaluate(
      base,
      [arm("a", true, { visitors: 1_000, byDevice: { mobile: device(600, 18, 19, 1_400) } }), arm("b", false)],
      STATS_VERSION,
    );
    expect(r.warnings.some((w) => w.includes("device split sums to"))).toBe(true);
  });

  it("emits all three devices even when nothing was seen on one", () => {
    const r = evaluate(base, [arm("a", true), arm("b", false)], STATS_VERSION);
    expect(Object.keys(r.variants[0].byDevice).sort()).toEqual(["desktop", "mobile", "tablet"]);
    expect(r.variants[0].byDevice.tablet.visitors).toBe(0);
  });
});

describe("srm and guardrail", () => {
  it("raises the SRM alarm on a broken split", () => {
    const r = evaluate(base, [arm("a", true, { visitors: 10_000 }), arm("b", false, { visitors: 8_500 })], STATS_VERSION);
    expect(r.srm.alarm).toBe(true);
    expect(r.srm.pValue).toBeLessThan(0.001);
    expect(r.warnings.some((w) => w.startsWith("SRM:"))).toBe(true);
  });

  it("stays quiet on a healthy split", () => {
    const r = evaluate(base, [arm("a", true, { visitors: 10_000 }), arm("b", false, { visitors: 9_980 })], STATS_VERSION);
    expect(r.srm.alarm).toBe(false);
  });

  it("guardrail fires from 500 visitors per arm at CR below half the control", () => {
    const broken = guardrail([arm("a", true, { visitors: 600, converters: 60 }), arm("b", false, { visitors: 600, converters: 20 })]);
    expect(broken).toMatchObject({ warning: "possible breakage", variantKeys: ["b"] });

    const tooEarly = guardrail([arm("a", true, { visitors: 499, converters: 50 }), arm("b", false, { visitors: 499, converters: 1 })]);
    expect(tooEarly).toBeNull();

    const smallArm = guardrail([arm("a", true, { visitors: 600, converters: 60 }), arm("b", false, { visitors: 400, converters: 1 })]);
    expect(smallArm).toBeNull(); // the variant arm is below 500 too

    const fine = guardrail([arm("a", true, { visitors: 600, converters: 60 }), arm("b", false, { visitors: 600, converters: 31 })]);
    expect(fine).toBeNull();
  });

  it("a significantly WORSE variant is significant but never the winner", () => {
    const r = evaluate(
      { ...base, plannedSampleSize: 500 },
      [arm("a", true, { visitors: 600, converters: 60 }), arm("b", false, { visitors: 600, converters: 20 })],
      STATS_VERSION,
    );
    expect(r.guardrail).not.toBeNull(); // the guardrail is a hint, not a veto – it neither sets nor suppresses a verdict
    expect(r.variants[1].significant).toBe(true);
    expect(r.variants[1].lift!).toBeLessThan(0);
    expect(r.winner).toBeNull();
  });
});

it("rejects input without a control arm", () => {
  expect(() => evaluate(base, [arm("b", false), arm("c", false)], STATS_VERSION)).toThrow(/no control variant/);
});
