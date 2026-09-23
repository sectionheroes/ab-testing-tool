/**
 * /jobs/daily-stats: history only, never the source of the results page (ADR-0019). Day boundaries in Shop.timezone
 * (4.8), and the same day may be written twice without changing anything.
 */
import { describe, expect, it } from "vitest";
import { addExposure, addOrder, inRollback, seedExperiment } from "../../test/db/fixture";
import { materialiseDailyStats } from "./daily-stats.server";

const NOW = new Date("2026-10-06T02:00:00Z");
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe("materialiseDailyStats", () => {
  it("buckets visitors and revenue by the shop's local day", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { timezone: "Europe/Berlin", startedAt: new Date("2026-10-01T00:00:00Z") });
      // 2026-10-05 in Berlin runs from 2026-10-04T22:00Z to 2026-10-05T22:00Z.
      await addExposure(tx, f, { at: "2026-10-04T21:00:00Z", visitorId: "v1" }); // 4 Oct local
      await addExposure(tx, f, { at: "2026-10-04T23:00:00Z", visitorId: "v2" }); // 5 Oct local
      await addExposure(tx, f, { at: "2026-10-05T12:00:00Z", visitorId: "v3" }); // 5 Oct local
      await addOrder(tx, f, { at: "2026-10-05T12:30:00Z", total: 100, refund: 25 });
      await materialiseDailyStats({ now: NOW, days: 3, db: tx });
      return tx.dailyStat.findMany({ where: { experimentId: f.experiment.id }, orderBy: { date: "asc" } });
    });

    const oct4 = rows.find((r) => r.date.toISOString().startsWith("2026-10-04"))!;
    const oct5 = rows.find((r) => r.date.toISOString().startsWith("2026-10-05"))!;
    expect(oct4.visitors).toBe(1);
    expect(oct5.visitors).toBe(2);
    expect(oct5.orders).toBe(1);
    expect(Number(oct5.revenueGross)).toBe(100);
    expect(Number(oct5.revenueNet)).toBe(75);
  });

  it("is idempotent per day – a second run upserts to the same numbers", async () => {
    const { first, second, count } = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-05T12:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-05T12:30:00Z", total: 100 });
      const first = await materialiseDailyStats({ now: NOW, days: 3, db: tx });
      const second = await materialiseDailyStats({ now: NOW, days: 3, db: tx });
      const count = await tx.dailyStat.count({ where: { experimentId: f.experiment.id } });
      return { first, second, count };
    });
    expect(first.rows).toBe(second.rows);
    expect(count).toBe(first.rows);
  });

  it("keeps tainted days in the history – they happened, they just do not count towards the verdict", async () => {
    const rows = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z"), taintedDays: ["2026-10-05"] });
      await addExposure(tx, f, { at: "2026-10-05T12:00:00Z" });
      await materialiseDailyStats({ now: NOW, days: 3, db: tx });
      return tx.dailyStat.findMany({ where: { experimentId: f.experiment.id } });
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].visitors).toBe(1);
    expect(rows[0].date).toEqual(day("2026-10-05"));
  });

  it("applies the same order filters as 4.8", async () => {
    const row = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-10-05T12:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-05T12:30:00Z", total: 100 });
      await addOrder(tx, f, { at: "2026-10-05T12:30:00Z", total: 200, sourceName: "pos" });
      await addOrder(tx, f, { at: "2026-10-05T12:30:00Z", total: 300, isTest: true });
      await addOrder(tx, f, { at: "2026-10-05T12:30:00Z", total: 400, cancelledAt: "2026-10-05T13:00:00Z" });
      await materialiseDailyStats({ now: NOW, days: 3, db: tx });
      return tx.dailyStat.findFirst({ where: { experimentId: f.experiment.id } });
    });
    expect(row?.orders).toBe(1);
    expect(Number(row?.revenueGross)).toBe(100);
  });

  it("skips experiments that ended before the window", async () => {
    const result = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-08-01T00:00:00Z"), endedAt: new Date("2026-08-15T00:00:00Z") });
      await addExposure(tx, f, { at: "2026-08-05T12:00:00Z" });
      const result = await materialiseDailyStats({ now: NOW, days: 3, db: tx });
      const rows = await tx.dailyStat.count({ where: { experimentId: f.experiment.id } });
      return { ...result, rows };
    });
    expect(result.rows).toBe(0);
  });
});
