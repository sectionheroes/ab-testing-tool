/**
 * ADR-0025: the snapshot is written once and never recomputed. That rule is only worth anything if it holds against
 * a real unique constraint, so these run against Postgres in a rolled-back transaction.
 */
import { describe, expect, it } from "vitest";
import { STATS_VERSION } from "../../lib/stats";
import { addExposure, addOrder, inRollback, seedExperiment } from "../../test/db/fixture";
import { freezeExperimentResult, getExperimentResult, SNAPSHOT_VERSION } from "./experiment-result.server";

const NOW = new Date("2026-10-20T00:00:00Z");

describe("freezeExperimentResult", () => {
  it("freezes the numbers, the context and the verdict", async () => {
    const { frozen, row } = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { endedAt: new Date("2026-10-10T00:00:00Z"), plannedSampleSize: 1 });
      await tx.variant.update({ where: { id: f.b.id }, data: { js: "document.title = 'b'", css: ".x{color:red}" } });
      await tx.experiment.update({
        where: { id: f.experiment.id },
        data: { hypothesis: "Reviews above the price lift CR", conclusion: "No measurable difference.", decision: "NO_DIFFERENCE" },
      });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", customerId: "c1" });
      await addExposure(tx, f, { variant: "b", at: "2026-10-02T09:00:00Z", customerId: "c2" });
      await addOrder(tx, f, { at: "2026-10-03T10:00:00Z", total: 80, customerId: "c1" });

      const frozen = await freezeExperimentResult(f.experiment.id, { now: NOW, db: tx });
      const row = await getExperimentResult(f.experiment.id, tx);
      return { frozen, row };
    });

    expect(frozen.created).toBe(true);
    expect(frozen.statsVersion).toBe(STATS_VERSION);
    expect(row?.v).toBe(SNAPSHOT_VERSION);
    expect(row?.statsVersion).toBe(STATS_VERSION);

    const snapshot = frozen.snapshot;
    // numbers: the evaluate() output, window closed at endedAt
    expect(snapshot.numbers.variants).toHaveLength(2);
    expect(snapshot.numbers.window).toMatchObject({ to: "2026-10-10T00:00:00.000Z" });
    expect(snapshot.numbers.srm).toBeDefined();
    expect(snapshot.numbers.statsVersion).toBe(STATS_VERSION);
    // frozen: what the test actually was – Variant is editable, this copy is not
    expect(snapshot.frozen.hypothesis).toBe("Reviews above the price lift CR");
    expect(snapshot.frozen.variants.find((v) => v.key === "b")?.js).toBe("document.title = 'b'");
    expect(snapshot.frozen.variants.find((v) => v.key === "b")?.css).toBe(".x{color:red}");
    expect(snapshot.frozen.salt).toBe("salt");
    expect(snapshot.frozen.allocation).toBe(1);
    expect(snapshot.frozen.trigger).toEqual({ type: "immediate" });
    expect(snapshot.verdict).toEqual({ decision: "NO_DIFFERENCE", conclusion: "No measurable difference." });
  });

  it("a second call does not overwrite the snapshot, even when the data changed underneath", async () => {
    const { first, second, rows } = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { endedAt: new Date("2026-10-10T00:00:00Z"), plannedSampleSize: 1 });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z", customerId: "c1" });
      const first = await freezeExperimentResult(f.experiment.id, { now: NOW, db: tx });

      // New data arrives after the freeze, and someone edits the variant code.
      await addExposure(tx, f, { at: "2026-10-03T09:00:00Z", customerId: "c2", visitorId: "later" });
      await addOrder(tx, f, { at: "2026-10-04T10:00:00Z", total: 999, customerId: "c2" });
      await tx.variant.update({ where: { id: f.b.id }, data: { js: "changed after the freeze" } });

      const second = await freezeExperimentResult(f.experiment.id, { now: new Date("2026-10-21T00:00:00Z"), db: tx });
      const rows = await tx.experimentResult.findMany({ where: { experimentId: f.experiment.id } });
      return { first, second, rows };
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(rows).toHaveLength(1);
    expect(second.id).toBe(first.id);
    // Same numbers as the first call: one visitor, no orders, the pre-edit variant code.
    expect(second.snapshot.numbers.variants[0].visitors).toBe(first.snapshot.numbers.variants[0].visitors);
    expect(second.snapshot.numbers.variants.reduce((s, v) => s + v.orders, 0)).toBe(0);
    expect(second.snapshot.frozen.variants.find((v) => v.key === "b")?.js).toBeNull();
  });

  it("carries the CODE_CHANGED_WHILE_RUNNING markers of contract 4.6", async () => {
    const snapshot = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { endedAt: new Date("2026-10-10T00:00:00Z") });
      await tx.auditLog.create({
        data: {
          shopId: f.shop.id,
          experimentId: f.experiment.id,
          actor: "joel@example.com",
          action: "CODE_CHANGED_WHILE_RUNNING",
          at: new Date("2026-10-05T12:00:00Z"),
          diff: { variant: "b", fields: ["js"] },
        },
      });
      await tx.auditLog.create({
        data: { shopId: f.shop.id, experimentId: f.experiment.id, actor: "joel@example.com", action: "UPDATED", diff: { variant: "b" } },
      });
      const { snapshot } = await freezeExperimentResult(f.experiment.id, { now: NOW, db: tx });
      return snapshot;
    });
    expect(snapshot.frozen.codeChanges).toEqual([{ at: "2026-10-05T12:00:00.000Z", actor: "joel@example.com", variantKey: "b" }]);
  });

  it("records the tainted days it excluded", async () => {
    const snapshot = await inRollback(async (tx) => {
      const f = await seedExperiment(tx, { endedAt: new Date("2026-10-10T00:00:00Z"), taintedDays: ["2026-10-03"] });
      await addExposure(tx, f, { at: "2026-10-02T09:00:00Z" });
      await addExposure(tx, f, { at: "2026-10-03T12:00:00Z", visitorId: "tainted" });
      const { snapshot } = await freezeExperimentResult(f.experiment.id, { now: NOW, db: tx });
      return snapshot;
    });
    expect(snapshot.frozen.taintedDays).toEqual(["2026-10-03"]);
    expect(snapshot.numbers.taintedDays).toEqual(["2026-10-03"]);
    expect(snapshot.numbers.variants[0].visitors).toBe(1);
  });

  it("refuses an experiment that does not exist", async () => {
    await expect(inRollback((tx) => freezeExperimentResult("nope", { db: tx }))).rejects.toThrow(/not found/);
  });
});
