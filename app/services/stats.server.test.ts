// The pure parts of stats.server.ts: folding the raw rows into arms, the sparse percentile and the winsorized
// moments. The SQL itself is covered by stats.server.db.test.ts, which needs a database.
import { describe, expect, it, vi } from "vitest";

vi.mock("../db.server", () => ({ default: {} }));
const { buildVariantStats, sparsePercentile, taintedDays, utcTimestamp, winsorizedMoments, UNKNOWN_DEVICE } = await import("./stats.server");
const { percentile } = await import("../../lib/stats");

type Row = Parameters<typeof buildVariantStats>[1][number];

const variant = (id: string, key: string, isControl: boolean) =>
  ({ id, key, name: key.toUpperCase(), isControl, weight: 0.5, experimentId: "e1", js: null, css: null, serverConfig: null, createdAt: new Date(), updatedAt: new Date() }) as Parameters<typeof buildVariantStats>[0][number];

const exposure = (variantId: string, device: string, isBot: boolean, n: number): Row =>
  ({ kind: "exposure", variant_id: variantId, device, is_bot: isBot, n, identity: null, net: 0 });
const order = (variantId: string, identity: string, net: number, device: string | null = null): Row =>
  ({ kind: "order", variant_id: variantId, device, is_bot: false, n: 1, identity, net });

describe("taintedDays", () => {
  it("keeps only well-formed dates, deduplicates and sorts", () => {
    expect(taintedDays({ taintedDays: ["2026-10-05", "2026-10-03", "2026-10-03"] })).toEqual(["2026-10-03", "2026-10-05"]);
  });
  it("ignores anything that is not a YYYY-MM-DD string", () => {
    expect(taintedDays({ taintedDays: ["03.10.2026", 42, null, { d: "x" }, "2026-10-03"] })).toEqual(["2026-10-03"]);
    expect(taintedDays({ taintedDays: "2026-10-03" })).toEqual([]);
    expect(taintedDays({ taintedDays: null })).toEqual([]);
  });
});

describe("utcTimestamp", () => {
  it("renders a UTC literal cast to timestamp, with no zone left in it", () => {
    const sql = utcTimestamp(new Date("2026-09-11T22:00:00.000Z"));
    expect(sql.values).toEqual(["2026-09-11 22:00:00.000"]);
    expect(sql.sql).toContain("::timestamp");
  });
});

describe("sparsePercentile", () => {
  it("agrees with the dense percentile of lib/stats on the expanded vector", () => {
    const nonZero = [10, 20, 30, 400];
    const total = 20;
    const dense = [...Array(total - nonZero.length).fill(0), ...nonZero];
    for (const q of [0, 0.25, 0.5, 0.8, 0.9, 0.95, 0.99, 1]) {
      expect(sparsePercentile(total, nonZero, q)).toBeCloseTo(percentile(dense, q), 10);
    }
  });

  it("places negative values (over-refunded orders) below the zeros", () => {
    const nonZero = [-50, 10, 20];
    const total = 10;
    const dense = [-50, ...Array(7).fill(0), 10, 20];
    for (const q of [0, 0.1, 0.5, 0.9, 1]) {
      expect(sparsePercentile(total, nonZero, q)).toBeCloseTo(percentile(dense, q), 10);
    }
  });

  it("is 0 when the converting share is below the tail being asked for", () => {
    // 5 converters in 1 000 visitors: the 99th percentile still sits in the zeros.
    expect(sparsePercentile(1_000, [10, 20, 30, 40, 50], 0.99)).toBe(0);
    expect(sparsePercentile(1_000, [10, 20, 30, 40, 50], 0.999)).toBeGreaterThan(0);
  });

  it("handles the degenerate sizes", () => {
    expect(sparsePercentile(0, [], 0.99)).toBeNaN();
    expect(sparsePercentile(1, [7], 0.99)).toBe(7);
    expect(sparsePercentile(1, [], 0.99)).toBe(0);
    expect(() => sparsePercentile(2, [1, 2, 3], 0.5)).toThrow(/more values than slots/);
  });
});

describe("winsorizedMoments", () => {
  it("caps the top and keeps every visitor in n", () => {
    const m = winsorizedMoments(100, [10, 20, 10_000], 20);
    expect(m.n).toBe(100);
    expect(m.mean).toBeCloseTo((10 + 20 + 20) / 100, 12);
  });

  it("matches a hand-expanded computation exactly", () => {
    const nonZero = [5, 15, 25];
    const cap = 20;
    const dense = [0, 0, 0, 0, 0, 0, 0, 5, 15, 20];
    const mean = dense.reduce((s, v) => s + v, 0) / 10;
    const variance = dense.reduce((s, v) => s + (v - mean) ** 2, 0) / 9;
    const m = winsorizedMoments(10, nonZero, cap);
    expect(m.mean).toBeCloseTo(mean, 12);
    expect(m.variance).toBeCloseTo(variance, 10);
  });

  it("never reports a negative variance", () => {
    expect(winsorizedMoments(50, [], 10).variance).toBe(0);
    expect(winsorizedMoments(1, [5], 10).variance).toBe(0);
    expect(winsorizedMoments(0, [], 10).n).toBe(0);
  });
});

describe("buildVariantStats", () => {
  const variants = [variant("va", "a", true), variant("vb", "b", false)];

  it("counts visitors per device, keeps bots out of the visitor count and reports them separately", () => {
    const stats = buildVariantStats(variants, [
      exposure("va", "mobile", false, 600),
      exposure("va", "desktop", false, 300),
      exposure("va", "tablet", false, 100),
      exposure("va", "mobile", true, 25),
      exposure("vb", "mobile", false, 1_000),
    ]);
    const a = stats[0];
    expect(a.visitors).toBe(1_000);
    expect(a.botVisitors).toBe(25);
    expect(a.byDevice?.mobile?.visitors).toBe(600);
    expect(a.byDevice?.desktop?.visitors).toBe(300);
    expect(a.byDevice?.tablet?.visitors).toBe(100);
    expect(stats[1].botVisitors).toBe(0);
  });

  it("deduplicates orders of one identity into a single conversion (ADR-0032)", () => {
    const stats = buildVariantStats(variants, [
      exposure("va", "mobile", false, 1_000),
      order("va", "cust-1", 100),
      order("va", "cust-1", 50), // same customer, second purchase
      order("va", "order:o9", 80), // guest order, its own identity
    ]);
    expect(stats[0].orders).toBe(3);
    expect(stats[0].converters).toBe(2);
    expect(stats[0].revenue).toBe(230);
  });

  it("puts orders without a linked exposure into the unknown device bucket", () => {
    const stats = buildVariantStats(variants, [
      exposure("va", "mobile", false, 1_000),
      order("va", "cust-1", 100, "mobile"),
      order("va", "cust-2", 60, null),
    ]);
    const a = stats[0];
    expect(a.byDevice?.mobile?.converters).toBe(1);
    expect(a.byDevice?.mobile?.revenue).toBe(100);
    // The unlinked one is in neither mobile, desktop nor tablet – it is still in the totals.
    const deviceRevenue = (["mobile", "desktop", "tablet"] as const).reduce((s, d) => s + (a.byDevice?.[d]?.revenue ?? 0), 0);
    expect(a.revenue).toBe(160);
    expect(deviceRevenue).toBe(100);
    expect(UNKNOWN_DEVICE).toBe("unknown");
  });

  it("winsorizes revenue per visitor over BOTH arms together", () => {
    // 200 visitors per arm; one single 10 000 € order in arm b must not survive the 99th percentile of the pool.
    const rows: Row[] = [exposure("va", "mobile", false, 200), exposure("vb", "mobile", false, 200)];
    for (let i = 0; i < 10; i++) rows.push(order("va", `a-${i}`, 100));
    for (let i = 0; i < 9; i++) rows.push(order("vb", `b-${i}`, 100));
    rows.push(order("vb", "b-whale", 10_000));

    const stats = buildVariantStats(variants, rows);
    const cappedMeanB = stats[1].rpvMoments!.mean;
    expect(stats[1].revenue).toBe(10_900); // the raw revenue still shows the whale
    expect(cappedMeanB * 200).toBeLessThan(1_500); // but the RPV moments do not
    expect(stats[0].rpvMoments!.n).toBe(200);
    expect(stats[1].rpvMoments!.n).toBe(200);
  });

  it("gives every arm moments even with no orders at all", () => {
    const stats = buildVariantStats(variants, [exposure("va", "mobile", false, 10), exposure("vb", "mobile", false, 10)]);
    expect(stats[0].converters).toBe(0);
    expect(stats[0].revenue).toBe(0);
    expect(stats[0].rpvMoments).toMatchObject({ n: 10, mean: 0 });
    expect(stats[0].aovMoments).toBeUndefined();
  });

  it("ignores rows for a variant that no longer exists instead of inventing an arm", () => {
    const stats = buildVariantStats(variants, [exposure("va", "mobile", false, 10), exposure("vGONE", "mobile", false, 999)]);
    expect(stats).toHaveLength(2);
    expect(stats.reduce((s, v) => s + v.visitors, 0)).toBe(10);
  });

  it("rounds money to cents", () => {
    const stats = buildVariantStats(variants, [exposure("va", "mobile", false, 10), order("va", "c1", 10.005), order("va", "c2", 0.005)]);
    expect(stats[0].revenue).toBe(10.01);
  });
});
