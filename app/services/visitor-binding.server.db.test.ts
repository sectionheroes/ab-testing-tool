/**
 * The visitor binding of ADR-0033 against a real Postgres: where `OrderAttribution.visitorId` is set, an order joins
 * straight onto its visitor's `Exposure`, and where it is not, the ADR-0032 identity fallback still applies with all of
 * its behaviour intact. Both paths matter – the fallback is not dead code, it is what every order without cart contact
 * takes.
 *
 * Every case runs in a rolled-back transaction (test/db/fixture.ts).
 */
import { describe, expect, it } from "vitest";
import { addExposure, addOrder, inRollback, seedExperiment } from "../../test/db/fixture";
import { computeExperimentStats } from "./stats.server";

const byKey = (stats: Awaited<ReturnType<typeof computeExperimentStats>>, key: string) => stats.variants.find((v) => v.key === key)!;
const NOW = new Date("2026-10-20T00:00:00Z");
const vid = (n: number) => `44f15d3c-6f0a-4b1e-9f7c-2a1b8e0d5c${String(n).padStart(2, "0")}`;

describe("the `_ab_v` path (contract 4.1b, ADR-0033)", () => {
  it("acceptance: two orders of the same GUEST visitor are one conversion and two orders", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), device: "mobile" });
      // No customerId anywhere – a pure guest. Before WP4.1 this counted as two conversions (the ADR-0032 bias).
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(1) });
      await addOrder(tx, f, { at: "2026-10-04T11:00:00Z", total: 60, visitorId: vid(1) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.visitors).toBe(1);
    expect(a.converters).toBe(1);
    expect(a.orders).toBe(2);
    expect(a.revenue).toBe(160);
    expect(a.cr).toBe(1);
    // No clamp fired: the count was right by itself, not corrected afterwards.
    expect(stats.warnings.some((w) => w.includes("clamped"))).toBe(false);
  });

  it("the same guest without `_ab_v` still counts twice – the bias this replaced", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      for (let i = 0; i < 4; i++) await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(i) });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100 });
      await addOrder(tx, f, { at: "2026-10-04T11:00:00Z", total: 60 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").converters).toBe(2);
  });

  it("acceptance: a guest order lands in its exposure's device bucket, not in `unknown`", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), device: "tablet" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(1) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.byDevice.tablet).toMatchObject({ visitors: 1, converters: 1, orders: 1, revenue: 100 });
    expect(a.byDevice.unknown).toMatchObject({ visitors: 0, converters: 0, orders: 0, revenue: 0 });
    expect(stats.deviceLinkRate).toBe(1);
    expect(stats.ordersWithoutDevice).toBe(0);
  });

  it("takes the visitor's real firstSeenAt as the window's lower bound, for guests too", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      // Exposed on 5 October; the order is from 3 October – after the experiment started, before this visitor saw it.
      await addExposure(tx, f, { at: "2026-10-05T09:00:00Z", visitorId: vid(1) });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 999, visitorId: vid(1) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    // Under the old fallback the lower bound was startedAt and this order would have counted.
    expect(byKey(stats, "a").orders).toBe(0);
    expect(byKey(stats, "a").revenue).toBe(0);
  });

  it("drops an order whose visitor was only ever exposed to a different variant (4.8)", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { variant: "a", at: "2026-10-02T09:00:00Z", visitorId: vid(1) });
      await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z", visitorId: vid(2) });
      // The order claims variant b but this visitor only ever saw a.
      await addOrder(tx, f, { variant: "b", at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(1) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "b").orders).toBe(0);
    expect(byKey(stats, "b").revenue).toBe(0);
  });

  it("keeps an order whose visitor has no exposure at all – a lost beacon is not a mismatch", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1) });
      // vid(9) never produced an exposure row (the beacon never got a 2xx), but the cart carried its id.
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(9) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.orders).toBe(1);
    expect(a.revenue).toBe(100);
    // It has no exposure, so it has no device: `unknown`, and it is visible there.
    expect(a.byDevice.unknown.orders).toBe(1);
    expect(stats.ordersWithoutDevice).toBe(1);
  });

  it("deduplicates by visitor even when the visitor has no exposure – the id is still the identity", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1) });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(9) });
      await addOrder(tx, f, { at: "2026-10-04T10:00:00Z", total: 100, visitorId: vid(9) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(2);
    expect(byKey(stats, "a").converters).toBe(1);
  });

  it("excludes a bot visitor's orders together with the bot exposure", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1) });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(2), isBot: true });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(1) });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 999, visitorId: vid(2) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").visitors).toBe(1);
    expect(byKey(stats, "a").orders).toBe(0 + 1);
    expect(byKey(stats, "a").revenue).toBe(100);
  });

  it("drops a visitor's orders when the visitor's exposure day is tainted (ADR-0026)", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", taintedDays: ["2026-10-03"] });
      await addExposure(tx, f, { at: "2026-10-02T21:00:00Z", visitorId: vid(1) }); // 2 Oct local – kept
      await addExposure(tx, f, { at: "2026-10-03T12:00:00Z", visitorId: vid(2) }); // 3 Oct local – tainted
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 10, visitorId: vid(1) });
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 500, visitorId: vid(2) });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").visitors).toBe(1);
    expect(byKey(stats, "a").orders).toBe(1);
    expect(byKey(stats, "a").revenue).toBe(10);
  });

  it("prefers the `_ab_v` link over the customer link when the two disagree", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      // The same person, two browsers: a desktop session while logged in, a mobile session as a guest.
      await addExposure(tx, f, { at: "2026-10-02T08:00:00Z", visitorId: vid(1), customerId: "cust-1", device: "desktop" });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(2), device: "mobile" });
      // The order was placed in the mobile session and carries its `_ab_v`, but Shopify knows the customer.
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, visitorId: vid(2), customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.byDevice.mobile.orders).toBe(1); // the device of the session that actually bought
    expect(a.byDevice.desktop.orders).toBe(0);
  });
});

describe("the ADR-0032 fallback stays intact for orders without `_ab_v`", () => {
  it("one customer with three orders is one conversion", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), customerId: "cust-1" });
      for (const total of [100, 50, 25]) await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total, customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(3);
    expect(byKey(stats, "a").converters).toBe(1);
    expect(byKey(stats, "a").revenue).toBe(175);
  });

  it("inherits the device through the customer link", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), customerId: "cust-1", device: "desktop" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").byDevice.desktop.orders).toBe(1);
    expect(stats.deviceLinkRate).toBe(1);
  });

  it("drops an order whose customer was only exposed to another variant", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { variant: "a", at: "2026-10-02T09:00:00Z", visitorId: vid(1), customerId: "cust-1" });
      await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z", visitorId: vid(2) });
      await addOrder(tx, f, { variant: "b", at: "2026-10-03T10:00:00Z", total: 100, customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "b").orders).toBe(0);
  });

  it("puts a guest order with neither `_ab_v` nor a customer into `unknown`", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), device: "mobile" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.byDevice.unknown).toMatchObject({ visitors: 0, orders: 1, converters: 1, revenue: 100 });
    expect(a.byDevice.mobile.orders).toBe(0);
    expect(stats.deviceLinkRate).toBe(0);
  });
});

describe("acceptance: all four device buckets sum to the totals", () => {
  it("for visitors, conversions, orders and revenue, with a mix of both paths", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      // Ten non-buying visitors per arm, so the arm-level converter clamp (ADR-0032 safety net) never fires and the
      // sums are the sums, not a clamped version of them.
      for (let i = 0; i < 10; i++) {
        await addExposure(tx, f, { variant: "a", at: "2026-10-02T08:00:00Z", visitorId: vid(20 + i), device: "desktop" });
        await addExposure(tx, f, { variant: "b", at: "2026-10-02T08:00:00Z", visitorId: vid(40 + i), device: "desktop" });
      }
      // Three linkable visitors, one per device, each with an order carrying `_ab_v`.
      for (const [i, device] of ["mobile", "desktop", "tablet"].entries()) {
        await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(i + 1), device });
        await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 10 * (i + 1), visitorId: vid(i + 1) });
      }
      // One more mobile visitor who bought twice from the same id: two orders, one conversion.
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(4), device: "mobile" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 5, visitorId: vid(4) });
      await addOrder(tx, f, { at: "2026-10-04T10:00:00Z", total: 7, visitorId: vid(4) });
      // Two unlinkable orders: no `_ab_v`, no customer. They belong in `unknown`.
      await addOrder(tx, f, { at: "2026-10-03T12:00:00Z", total: 100 });
      await addOrder(tx, f, { at: "2026-10-03T13:00:00Z", total: 200 });
      // And something on the other arm too, so the totals are not trivially one-sided.
      await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z", visitorId: vid(5), device: "desktop" });
      await addOrder(tx, f, { variant: "b", at: "2026-10-03T10:00:00Z", total: 40, visitorId: vid(5) });
      await addOrder(tx, f, { variant: "b", at: "2026-10-03T14:00:00Z", total: 80 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });

    expect(stats.warnings.some((w) => w.includes("clamped"))).toBe(false);

    for (const key of ["a", "b"]) {
      const arm = byKey(stats, key);
      const buckets = [arm.byDevice.mobile, arm.byDevice.desktop, arm.byDevice.tablet, arm.byDevice.unknown];
      const sum = (pick: (d: (typeof buckets)[number]) => number) => buckets.reduce((s, b) => s + pick(b), 0);
      expect(sum((d) => d.visitors)).toBe(arm.visitors);
      expect(sum((d) => d.converters)).toBe(arm.converters);
      expect(sum((d) => d.orders)).toBe(arm.orders);
      expect(Math.round(sum((d) => d.revenue) * 100) / 100).toBe(arm.revenue);
    }

    const a = byKey(stats, "a");
    expect(a.visitors).toBe(14); // 10 non-buyers + 4 buyers
    expect(a.orders).toBe(7); // 3 + 2 + 2 unlinkable
    expect(a.converters).toBe(6); // 4 visitors + 2 unlinkable identities
    expect(a.revenue).toBe(10 + 20 + 30 + 5 + 7 + 100 + 200);
    expect(a.byDevice.mobile).toMatchObject({ visitors: 2, converters: 2, orders: 3 });
    expect(a.byDevice.tablet).toMatchObject({ visitors: 1, converters: 1, orders: 1 });
    expect(a.byDevice.unknown).toMatchObject({ visitors: 0, converters: 2, orders: 2, revenue: 300 });
    // deviceLinkRate is experiment-wide, not per arm: 5 of 7 on a plus 1 of 2 on b.
    expect(stats.deviceLinkRate).toBeCloseTo(6 / 9, 10);
    expect(stats.ordersWithoutDevice).toBe(3);
  });

  it("the arm-level clamp can break the converter sum, and says so – the buckets are never clamped", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      // One visitor, three unlinkable orders: three identities on one visitor. The arm is clamped to 1 (CR ≤ 100 %),
      // the `unknown` bucket keeps all three, because clamping it to its 0 visitors would zero the bucket.
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", visitorId: vid(1), device: "mobile" });
      for (const total of [10, 20, 30]) await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.converters).toBe(1);
    expect(a.byDevice.unknown.converters).toBe(3);
    expect(a.orders).toBe(3);
    expect(a.byDevice.unknown.orders).toBe(3);
    // The discrepancy is announced, not hidden – that is what the clamp warning is for.
    expect(stats.warnings.some((w) => w.includes("clamped"))).toBe(true);
  });
});
