/**
 * The counting definitions of contract 4.8 against a real Postgres – the SQL is where they actually live, so a mock
 * would prove nothing. Every case runs in a rolled-back transaction (test/db/fixture.ts).
 *
 * Dev-store orders are all `test = true` (WP3 finding), so the order filters cannot be shown end-to-end before WP7.
 * These tests are the stand-in: each filter of 4.8 gets its own row and its own assertion.
 */
import { describe, expect, it } from "vitest";
import { addExposure, addOrder, inRollback, seedExperiment } from "../../test/db/fixture";
import { computeExperimentStats, setTaintedDay } from "./stats.server";

const byKey = (stats: Awaited<ReturnType<typeof computeExperimentStats>>, key: string) => stats.variants.find((v) => v.key === key)!;
const NOW = new Date("2026-10-20T00:00:00Z");

describe("order filters (contract 4.8)", () => {
  it("counts web orders and drops pos, draft, test and cancelled ones", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 100 }); // counts
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 200, sourceName: "pos" });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 300, sourceName: "shopify_draft_order" });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 400, isTest: true });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 500, cancelledAt: "2026-10-03T10:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 600, sourceName: "shop_app" }); // Shop app counts
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(2);
    expect(byKey(stats, "a").revenue).toBe(700);
  });

  it("subtracts refunds from the attributed revenue", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 100, refund: 30 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").revenue).toBe(70);
    expect(byKey(stats, "a").orders).toBe(1);
  });

  it("ignores orders without an attribution row", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-02T10:00:00Z", total: 100, attribute: false });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(0);
  });

  it("closes the attribution window at endedAt, not at now", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { endedAt: new Date("2026-10-10T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 100 }); // inside
      await addOrder(tx, f, { at: "2026-10-12T10:00:00Z", total: 999 }); // after endedAt
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(1);
    expect(byKey(stats, "a").revenue).toBe(100);
  });

  it("does not count orders placed before the experiment started", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-09-25T10:00:00Z", total: 999 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(0);
  });
});

describe("visitors and conversions (contract 4.8, ADR-0032)", () => {
  it("excludes bot exposures from visitors and reports them as bot share", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      for (let i = 0; i < 3; i++) await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", isBot: true });
      await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").visitors).toBe(3);
    expect(stats.botShare).toBeCloseTo(1 / 5, 10);
  });

  it("counts one customer with three orders as one conversion", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", customerId: "cust-1" });
      for (const total of [100, 50, 25]) await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total, customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.orders).toBe(3);
    expect(a.converters).toBe(1);
    expect(a.cr).toBe(1);
    expect(a.revenue).toBe(175);
  });

  it("counts guest orders without a customer id separately (the known bias of ADR-0032)", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      for (let i = 0; i < 4; i++) await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100 });
      await addOrder(tx, f, { at: "2026-10-03T11:00:00Z", total: 100 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").converters).toBe(2); // two guest orders = two identities
    expect(byKey(stats, "a").cr).toBeCloseTo(0.5, 10);
  });

  it("clamps the conversion rate at 100 % and warns (ADR-0032)", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100 });
      await addOrder(tx, f, { at: "2026-10-03T11:00:00Z", total: 100 });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").visitors).toBe(1);
    expect(byKey(stats, "a").converters).toBe(1);
    expect(byKey(stats, "a").cr).toBe(1);
    expect(stats.warnings.some((w) => w.includes("clamped"))).toBe(true);
  });

  it("gives a linked order its visitor's device and leaves an unlinked one without one", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", customerId: "cust-1", device: "desktop" });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", device: "mobile" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, customerId: "cust-1" }); // links
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 60 }); // guest, no device
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    expect(a.byDevice.desktop.converters).toBe(1);
    expect(a.byDevice.desktop.revenue).toBe(100);
    expect(a.byDevice.mobile.converters).toBe(0);
    expect(a.revenue).toBe(160);
    expect(stats.deviceLinkRate).toBeCloseTo(0.5, 10);
    expect(stats.ordersWithoutDevice).toBe(1);
  });

  it("drops an order whose customer was only ever exposed to a different variant (4.8: no matching exposure)", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { variant: "a", at: "2026-10-02T09:00:00Z", customerId: "cust-1" });
      await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { variant: "b", at: "2026-10-03T10:00:00Z", total: 100, customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "b").orders).toBe(0);
    expect(byKey(stats, "b").revenue).toBe(0);
  });

  it("drops an order placed before its own visitor was ever exposed", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await addExposure(tx, f, { at: "2026-10-05T09:00:00Z", customerId: "cust-1" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 100, customerId: "cust-1" });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(0);
  });
});

describe("tainted days (ADR-0026) – in Shop.timezone, not UTC", () => {
  it("removes exactly that day's exposures and their orders", async () => {
    const result = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", plannedSampleSize: 1 });
      // 2026-10-03 in Berlin is 2026-10-02T22:00Z .. 2026-10-03T22:00Z.
      await addExposure(tx, f, { at: "2026-10-02T21:00:00Z", customerId: "keep-early" }); // 2 Oct local
      await addExposure(tx, f, { at: "2026-10-02T23:00:00Z", customerId: "taint-1" }); // 3 Oct local
      await addExposure(tx, f, { at: "2026-10-03T12:00:00Z", customerId: "taint-2" }); // 3 Oct local
      await addExposure(tx, f, { at: "2026-10-03T22:30:00Z", customerId: "keep-late" }); // 4 Oct local
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 10, customerId: "keep-early" });
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 100, customerId: "taint-1" });
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 200, customerId: "taint-2" });
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 20, customerId: "keep-late" });

      const before = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
      const set = await setTaintedDay(f.experiment.id, "2026-10-03", true, "joel@example.com", tx);
      const after = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
      const audit = await tx.auditLog.findMany({ where: { experimentId: f.experiment.id } });
      return { before, after, set, audit };
    });

    expect(byKey(result.before, "a").visitors).toBe(4);
    expect(byKey(result.before, "a").orders).toBe(4);
    expect(byKey(result.before, "a").revenue).toBe(330);

    // Exactly the two exposures of 3 October local time, and exactly their two orders.
    expect(byKey(result.after, "a").visitors).toBe(2);
    expect(byKey(result.after, "a").orders).toBe(2);
    expect(byKey(result.after, "a").revenue).toBe(30);
    expect(result.after.taintedDays).toEqual(["2026-10-03"]);
    expect(result.set.changed).toBe(true);
    expect(result.audit).toHaveLength(1);
    expect(result.audit[0].action).toBe("UPDATED");
    expect(result.audit[0].actor).toBe("joel@example.com");
  });

  it("also drops orders created on the tainted day itself", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { taintedDays: ["2026-10-06"] });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-05T10:00:00Z", total: 50 });
      await addOrder(tx, f, { at: "2026-10-06T10:00:00Z", total: 500 }); // 6 Oct local – gone
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(byKey(stats, "a").orders).toBe(1);
    expect(byKey(stats, "a").revenue).toBe(50);
  });

  it("uses the shop's timezone: the same instant is tainted in Berlin but not in UTC", async () => {
    const counts = await inRollback(async (tx) => {
      const berlin = await seedExperiment(tx, { timezone: "Europe/Berlin", taintedDays: ["2026-10-03"] });
      const utc = await seedExperiment(tx, { timezone: "UTC", taintedDays: ["2026-10-03"] });
      for (const f of [berlin, utc]) await addExposure(tx, f, { at: "2026-10-02T23:00:00Z" });
      return {
        berlin: await computeExperimentStats(berlin.experiment.id, { now: NOW, db: tx }),
        utc: await computeExperimentStats(utc.experiment.id, { now: NOW, db: tx }),
      };
    });
    expect(byKey(counts.berlin, "a").visitors).toBe(0); // 23:00Z = 01:00 on 3 Oct in Berlin
    expect(byKey(counts.utc, "a").visitors).toBe(1); // still 2 Oct in UTC
  });

  it("unsetting a tainted day brings the numbers back and is idempotent", async () => {
    const result = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { taintedDays: ["2026-10-03"] });
      await addExposure(tx, f, { at: "2026-10-03T12:00:00Z" });
      const tainted = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
      const unset = await setTaintedDay(f.experiment.id, "2026-10-03", false, "joel", tx);
      const again = await setTaintedDay(f.experiment.id, "2026-10-03", false, "joel", tx);
      const clean = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
      return { tainted, unset, again, clean };
    });
    expect(byKey(result.tainted, "a").visitors).toBe(0);
    expect(result.unset.changed).toBe(true);
    expect(result.again.changed).toBe(false); // no second AuditLog entry for a no-op
    expect(byKey(result.clean, "a").visitors).toBe(1);
  });

  it("rejects a day that is not YYYY-MM-DD", async () => {
    await expect(
      inRollback(async (tx) => {
        const f = await seedExperiment(tx);
        return setTaintedDay(f.experiment.id, "03.10.2026", true, "joel", tx);
      }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe("evaluate() over real data", () => {
  it("stays insignificant below the planned sample size and turns significant once it is reached", async () => {
    const result = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { plannedSampleSize: 1_000 });
      // 40 visitors per arm, control 5 conversions, variant 25 – p is tiny, the plan is not met.
      for (let i = 0; i < 40; i++) {
        await addExposure(tx, f, { variant: "a", at: "2026-10-02T09:00:00Z", visitorId: `a${i}` });
        await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z", visitorId: `b${i}` });
      }
      for (let i = 0; i < 5; i++) await addOrder(tx, f, { variant: "a", at: "2026-10-03T10:00:00Z", customerId: `ca${i}`, total: 100 });
      for (let i = 0; i < 25; i++) await addOrder(tx, f, { variant: "b", at: "2026-10-03T10:00:00Z", customerId: `cb${i}`, total: 100 });
      const below = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
      await tx.experiment.update({ where: { id: f.experiment.id }, data: { plannedSampleSize: 40 } });
      const reached = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
      return { below, reached };
    });

    expect(byKey(result.below, "b").pValue!).toBeLessThan(0.001);
    expect(result.below.sampleSizeReached).toBe(false);
    expect(byKey(result.below, "b").significant).toBe(false);
    expect(result.below.winner).toBeNull();

    expect(result.reached.sampleSizeReached).toBe(true);
    expect(byKey(result.reached, "b").significant).toBe(true);
    expect(result.reached.winner).toBe("b");
  });

  it("device numbers add up to the totals when every order links", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      for (const [i, device] of ["mobile", "desktop", "tablet"].entries()) {
        await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", customerId: `c${i}`, device, visitorId: `v${i}` });
        await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", customerId: `c${i}`, total: 10 * (i + 1) });
      }
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    const a = byKey(stats, "a");
    const sum = (pick: (d: { visitors: number; orders: number; revenue: number }) => number) =>
      pick(a.byDevice.mobile) + pick(a.byDevice.desktop) + pick(a.byDevice.tablet);
    expect(sum((d) => d.visitors)).toBe(a.visitors);
    expect(sum((d) => d.orders)).toBe(a.orders);
    expect(sum((d) => d.revenue)).toBe(a.revenue);
    expect(stats.deviceLinkRate).toBe(1);
  });

  it("raises SRM when the split does not match the weights", async () => {
    const stats = await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      for (let i = 0; i < 600; i++) await addExposure(tx, f, { variant: "a", at: "2026-10-02T09:00:00Z", visitorId: `a${i}` });
      for (let i = 0; i < 400; i++) await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z", visitorId: `b${i}` });
      return computeExperimentStats(f.experiment.id, { now: NOW, db: tx });
    });
    expect(stats.srm.alarm).toBe(true);
    expect(stats.srm.pValue).toBeLessThan(0.001);
  });
});
