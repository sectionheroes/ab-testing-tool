/**
 * `listCounts` is a second piece of SQL that implements the counting rules of contract 4.8 — the cheap one the
 * experiments list needs, next to the full aggregation of `rawStatsRows`. Two implementations of the same contract
 * is exactly the kind of thing that drifts, so the first test here pins them against each other on a fixture that
 * exercises every branch they share: the `_ab_v` join of ADR-0033, the ADR-0032 customer fallback, a repeat
 * purchase, a bot, a test order, a cancelled order and a POS order.
 *
 * Everything runs inside a rolled-back transaction (CLAUDE.md).
 */
import { describe, expect, it } from "vitest";
import { addExposure, addOrder, inRollback, seedExperiment, type Tx } from "../../test/db/fixture";
import { listExperiments } from "./experiment-list.server";
import { computeExperimentStats, listCounts } from "./stats.server";

const NOW = new Date("2026-10-15T12:00:00Z");

/** One experiment with every attribution path represented. */
async function seedEverything(tx: Tx) {
  const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z"), minConversionsPerArm: 1000, minDurationDays: 14 });

  // Control: two visitors, one of them converts twice (4.8 – that is one conversion).
  await addExposure(tx, f, { visitorId: "a1", at: "2026-10-02T09:00:00Z" });
  await addExposure(tx, f, { visitorId: "a2", at: "2026-10-02T10:00:00Z" });
  await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 50, visitorId: "a1" });
  await addOrder(tx, f, { at: "2026-10-04T10:00:00Z", total: 70, visitorId: "a1" });

  // Variant B: three visitors; one converts through `_ab_v`, one through the customer link (no `_ab_v`), one not.
  await addExposure(tx, f, { variant: "b", visitorId: "b1", at: "2026-10-02T09:00:00Z" });
  await addExposure(tx, f, { variant: "b", visitorId: "b2", at: "2026-10-02T09:30:00Z", customerId: "cust-2" });
  await addExposure(tx, f, { variant: "b", visitorId: "b3", at: "2026-10-02T11:00:00Z" });
  await addOrder(tx, f, { variant: "b", at: "2026-10-05T10:00:00Z", total: 120, visitorId: "b1" });
  await addOrder(tx, f, { variant: "b", at: "2026-10-06T10:00:00Z", total: 90, customerId: "cust-2", source: "CUSTOMER_LOOKUP" });

  // Things that must not count (4.8): a bot exposure, a test order, a cancelled order, a POS order.
  await addExposure(tx, f, { variant: "b", visitorId: "bot1", at: "2026-10-02T12:00:00Z", isBot: true });
  await addOrder(tx, f, { variant: "b", at: "2026-10-07T10:00:00Z", total: 500, visitorId: "b3", isTest: true });
  await addOrder(tx, f, { variant: "b", at: "2026-10-07T11:00:00Z", total: 500, visitorId: "b3", cancelledAt: "2026-10-08T10:00:00Z" });
  await addOrder(tx, f, { variant: "b", at: "2026-10-07T12:00:00Z", total: 500, visitorId: "b3", sourceName: "pos" });

  return f;
}

describe("listCounts agrees with the full aggregation (contract 4.8)", () => {
  it("same visitors and same converting visitors per arm", async () => {
    await inRollback(async (tx) => {
      const f = await seedEverything(tx);

      const cheap = await listCounts([{ id: f.experiment.id, startedAt: f.experiment.startedAt, endedAt: null }], { now: NOW, db: tx });
      const full = await computeExperimentStats(f.experiment.id, { now: NOW, db: tx });

      for (const variant of full.variants) {
        const id = variant.key === "a" ? f.a.id : f.b.id;
        const row = cheap.find((c) => c.variantId === id);
        expect(row, `no cheap row for variant ${variant.key}`).toBeDefined();
        expect(row!.visitors, `visitors of ${variant.key}`).toBe(variant.visitors);
        expect(row!.converters, `converters of ${variant.key}`).toBe(variant.converters);
      }

      // And the fixture really does exercise what it claims: 2 vs 3 visitors, 1 vs 2 conversions.
      expect(cheap.find((c) => c.variantId === f.a.id)).toMatchObject({ visitors: 2, converters: 1 });
      expect(cheap.find((c) => c.variantId === f.b.id)).toMatchObject({ visitors: 3, converters: 2 });
    });
  });

  it("closes the window at endedAt, like the full aggregation does", async () => {
    await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, f, { visitorId: "a1", at: "2026-10-02T09:00:00Z" });
      await addOrder(tx, f, { at: "2026-10-09T10:00:00Z", total: 50, visitorId: "a1" }); // after the end

      const ended = new Date("2026-10-05T00:00:00Z");
      const cheap = await listCounts([{ id: f.experiment.id, startedAt: f.experiment.startedAt, endedAt: ended }], { now: NOW, db: tx });
      expect(cheap.find((c) => c.variantId === f.a.id)).toMatchObject({ visitors: 1, converters: 0 });
    });
  });

  it("answers several experiments in one query", async () => {
    await inRollback(async (tx) => {
      const one = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      const two = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      await addExposure(tx, one, { visitorId: "o1", at: "2026-10-02T09:00:00Z" });
      await addExposure(tx, two, { visitorId: "t1", at: "2026-10-02T09:00:00Z" });
      await addExposure(tx, two, { visitorId: "t2", at: "2026-10-02T09:00:00Z" });

      const rows = await listCounts(
        [
          { id: one.experiment.id, startedAt: one.experiment.startedAt, endedAt: null },
          { id: two.experiment.id, startedAt: two.experiment.startedAt, endedAt: null },
        ],
        { now: NOW, db: tx },
      );
      expect(rows.filter((r) => r.experimentId === one.experiment.id).reduce((s, r) => s + r.visitors, 0)).toBe(1);
      expect(rows.filter((r) => r.experimentId === two.experiment.id).reduce((s, r) => s + r.visitors, 0)).toBe(2);
    });
  });

  it("returns nothing for an experiment that never started", async () => {
    await inRollback(async (tx) => {
      await expect(listCounts([{ id: "x", startedAt: null, endedAt: null }], { now: NOW, db: tx })).resolves.toEqual([]);
    });
  });
});

describe("listExperiments", () => {
  it("builds the progress cell from the smaller arm and projects an end date (ADR-0036/0037)", async () => {
    await inRollback(async (tx) => {
      const f = await seedEverything(tx);
      const rows = await listExperiments({ shopId: f.shop.id, now: NOW, db: tx });
      const row = rows.find((r) => r.id === f.experiment.id)!;

      expect(row.conversions).toBe(3); // 1 + 2
      expect(row.result.kind).toBe("progress");
      // The smaller arm has 1 of 1.000 conversions – the bar follows the slower arm, never the faster one.
      expect(row.result.progress).toBeCloseTo(1 / 1000, 6);
      expect(row.result.tone).toBe("neutral"); // no colour before the rule is met
      expect(row.result.headline).toBeNull();
      expect(row.result.note).toMatch(/^est\. \d{2}\.\d{2}\.\d{4}$/);
    });
  });

  it("a draft has no numbers at all", async () => {
    await inRollback(async (tx) => {
      const f = await seedExperiment(tx);
      await tx.experiment.update({ where: { id: f.experiment.id }, data: { status: "DRAFT", startedAt: null } });
      const row = (await listExperiments({ shopId: f.shop.id, now: NOW, db: tx }))[0];
      expect(row.status).toBe("DRAFT");
      expect(row.conversions).toBeNull();
      expect(row.runtimeDays).toBeNull();
      expect(row.result).toMatchObject({ kind: "none", headline: null, progress: null });
    });
  });

  it("a paused experiment says so instead of projecting a date", async () => {
    await inRollback(async (tx) => {
      const f = await seedEverything(tx);
      await tx.experiment.update({ where: { id: f.experiment.id }, data: { status: "PAUSED" } });
      const row = (await listExperiments({ shopId: f.shop.id, now: NOW, db: tx })).find((r) => r.id === f.experiment.id)!;
      expect(row.result.kind).toBe("progress");
      expect(row.result.note).toBe("not collecting while paused");
    });
  });

  it("a broken assignment switches the verdict off entirely", async () => {
    await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      // 50/50 configured, 200 vs 20 observed: χ² far past the 0.001 alarm of ADR-0018.
      for (let i = 0; i < 200; i++) await addExposure(tx, f, { visitorId: `a${i}`, at: "2026-10-02T09:00:00Z" });
      for (let i = 0; i < 20; i++) await addExposure(tx, f, { variant: "b", visitorId: `b${i}`, at: "2026-10-02T09:00:00Z" });

      const row = (await listExperiments({ shopId: f.shop.id, now: NOW, db: tx })).find((r) => r.id === f.experiment.id)!;
      expect(row.result).toMatchObject({ kind: "srm", headline: "Assignment broken", note: "No verdict", tone: "negative" });
    });
  });

  it("sorts running → paused → draft → ended", async () => {
    await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z") });
      for (const [key, status] of [
        ["z-ended", "ENDED"],
        ["y-draft", "DRAFT"],
        ["x-paused", "PAUSED"],
      ] as const) {
        await tx.experiment.create({
          data: {
            shopId: f.shop.id,
            key,
            name: key,
            status,
            salt: "x",
            targeting: {},
            trigger: { type: "immediate" },
            startedAt: status === "DRAFT" ? null : new Date("2026-10-01T00:00:00Z"),
            endedAt: status === "ENDED" ? new Date("2026-10-10T00:00:00Z") : null,
            decision: status === "ENDED" ? "NO_DIFFERENCE" : null,
            variants: { create: [{ key: "a", name: "Control", weight: 0.5, isControl: true }, { key: "b", name: "B", weight: 0.5 }] },
          },
        });
      }
      const rows = await listExperiments({ shopId: f.shop.id, now: NOW, db: tx });
      expect(rows.map((r) => r.status)).toEqual(["RUNNING", "PAUSED", "DRAFT", "ENDED"]);
    });
  });

  it("an ended experiment reads its frozen snapshot, never a recomputation (ADR-0025)", async () => {
    await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z"), endedAt: new Date("2026-10-10T00:00:00Z") });
      await tx.experimentResult.create({
        data: {
          experimentId: f.experiment.id,
          shopId: f.shop.id,
          v: 1,
          statsVersion: "2.0.0",
          frozenAt: new Date("2026-10-10T00:00:00Z"),
          snapshot: {
            numbers: {
              winner: "b",
              variants: [
                { key: "a", isControl: true, converters: 1200, significant: false, metrics: { CR: { lift: null }, RPV: { lift: null }, AOV: { lift: null } } },
                { key: "b", isControl: false, converters: 1300, significant: true, metrics: { CR: { lift: 0.061 }, RPV: { lift: 0.02 }, AOV: { lift: 0.01 } } },
              ],
              stoppingRule: { met: true, converterFloor: 1200, elapsedDays: 9 },
            },
            frozen: {},
            verdict: { decision: "WINNER", conclusion: "Shipped." },
          },
        },
      });
      await tx.experiment.update({ where: { id: f.experiment.id }, data: { decision: "WINNER" } });

      const row = (await listExperiments({ shopId: f.shop.id, now: NOW, db: tx }))[0];
      // Numbers straight out of the snapshot, including conversions no exposure row in this fixture could produce.
      expect(row.conversions).toBe(2500);
      expect(row.result).toMatchObject({ kind: "verdict", headline: "B shipped · +6,1 %", note: "Conversion rate", tone: "positive" });
    });
  });

  it("an ended experiment with no difference keeps the control and says so", async () => {
    await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { startedAt: new Date("2026-10-01T00:00:00Z"), endedAt: new Date("2026-10-10T00:00:00Z") });
      await tx.experimentResult.create({
        data: {
          experimentId: f.experiment.id,
          shopId: f.shop.id,
          v: 1,
          statsVersion: "2.0.0",
          frozenAt: new Date("2026-10-10T00:00:00Z"),
          snapshot: {
            numbers: {
              winner: null,
              variants: [
                { key: "a", isControl: true, converters: 900, significant: false, metrics: { CR: { lift: null }, RPV: { lift: null }, AOV: { lift: null } } },
                { key: "b", isControl: false, converters: 880, significant: true, metrics: { CR: { lift: -0.021 }, RPV: { lift: 0 }, AOV: { lift: 0 } } },
              ],
              stoppingRule: { met: true, converterFloor: 880, elapsedDays: 9 },
            },
            frozen: {},
            verdict: { decision: "NO_DIFFERENCE", conclusion: "" },
          },
        },
      });

      const row = (await listExperiments({ shopId: f.shop.id, now: NOW, db: tx }))[0];
      expect(row.result).toMatchObject({ kind: "verdict", headline: "Control kept", note: "B was worse · -2,1 %", tone: "neutral" });
    });
  });
});
