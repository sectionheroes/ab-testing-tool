import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  experiment: { findUnique: vi.fn(), update: vi.fn() },
  variant: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  experimentResult: { delete: vi.fn() },
  // The ENDED path wraps the update and the snapshot in one transaction (ADR-0025); the mock just runs the callback.
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
};
vi.mock("../db.server", () => ({ default: db }));
const syncShopConfig = vi.fn();
vi.mock("./metafields.server", () => ({ syncShopConfig }));
const freezeExperimentResult = vi.fn();
vi.mock("./experiment-result.server", () => ({ freezeExperimentResult }));
const { setExperimentStatus, saveVariantCode, setStoppingRule, ExperimentError } = await import("./experiments.server");

const RULE: { minConversionsPerArm: number | null; minDurationDays: number | null; requireFullWeeks: boolean } = {
  minConversionsPerArm: 1_000,
  minDurationDays: 14,
  requireFullWeeks: true,
};
const base = { id: "e1", shopId: "shop1", key: "demo-test", status: "DRAFT", startedAt: null, endedAt: null, decision: null, conclusion: null, ...RULE };
const ok = { skipped: false, bytes: 1, experiments: 1, updatedAt: "t", config: {} };

beforeEach(() => {
  for (const m of [db.experiment.findUnique, db.experiment.update, db.variant.findUnique, db.variant.update, db.auditLog.create, db.experimentResult.delete, syncShopConfig, freezeExperimentResult]) m.mockReset();
  freezeExperimentResult.mockResolvedValue({ id: "res1", created: true, statsVersion: "1.0.0", snapshot: {} });
  db.experiment.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...base, ...data }));
  db.variant.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "v1", key: "b", ...data }));
  syncShopConfig.mockResolvedValue(ok);
});

describe("setExperimentStatus", () => {
  it("DRAFT → RUNNING sets startedAt once, syncs the config, logs STATUS_CHANGED", async () => {
    db.experiment.findUnique.mockResolvedValue(base);
    const { experiment } = await setExperimentStatus("e1", "RUNNING", "joel");
    expect(experiment.status).toBe("RUNNING");
    expect(experiment.startedAt).toBeInstanceOf(Date);
    expect(syncShopConfig).toHaveBeenCalledWith("shop1");
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "STATUS_CHANGED", experimentId: "e1", diff: { from: "DRAFT", to: "RUNNING" } });
  });

  it("PAUSED → RUNNING keeps the original startedAt (attribution window 4.8)", async () => {
    const started = new Date("2026-09-01T00:00:00Z");
    db.experiment.findUnique.mockResolvedValue({ ...base, status: "PAUSED", startedAt: started });
    await setExperimentStatus("e1", "RUNNING", "joel");
    expect(db.experiment.update.mock.calls[0][0].data).toEqual({ status: "RUNNING" });
  });

  it("ENDED requires a decision and sets endedAt", async () => {
    db.experiment.findUnique.mockResolvedValue({ ...base, status: "RUNNING", startedAt: new Date() });
    await expect(setExperimentStatus("e1", "ENDED", "joel")).rejects.toMatchObject({ code: "DECISION_REQUIRED" });
    expect(db.experiment.update).not.toHaveBeenCalled();
    const { experiment } = await setExperimentStatus("e1", "ENDED", "joel", { decision: "ABORTED", conclusion: "meh" });
    expect(experiment.endedAt).toBeInstanceOf(Date);
    expect(db.experiment.update.mock.calls[0][0].data).toMatchObject({ status: "ENDED", decision: "ABORTED", conclusion: "meh" });
  });

  it("rejects illegal transitions (ENDED is terminal, DRAFT cannot pause)", async () => {
    db.experiment.findUnique.mockResolvedValue({ ...base, status: "ENDED" });
    await expect(setExperimentStatus("e1", "RUNNING", "joel")).rejects.toBeInstanceOf(ExperimentError);
    db.experiment.findUnique.mockResolvedValue(base);
    await expect(setExperimentStatus("e1", "PAUSED", "joel")).rejects.toMatchObject({ code: "BAD_TRANSITION" });
  });

  it("rolls the DB back when the metafield write fails", async () => {
    db.experiment.findUnique.mockResolvedValue(base);
    syncShopConfig.mockRejectedValue(new Error("shopify down"));
    await expect(setExperimentStatus("e1", "RUNNING", "joel")).rejects.toThrow("shopify down");
    expect(db.experiment.update).toHaveBeenCalledTimes(2);
    expect(db.experiment.update.mock.calls[1][0].data).toMatchObject({ status: "DRAFT", startedAt: null });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("saveVariantCode", () => {
  const variant = (status: string) => ({ id: "v1", key: "b", experimentId: "e1", js: "old", css: null, experiment: { ...base, status } });

  it("on RUNNING it is a hotfix: CODE_CHANGED_WHILE_RUNNING + immediate sync", async () => {
    db.variant.findUnique.mockResolvedValue(variant("RUNNING"));
    const r = await saveVariantCode("v1", { js: "new", css: "" }, "joel");
    expect(r.hotfix).toBe(true);
    expect(db.variant.update.mock.calls[0][0].data).toEqual({ js: "new", css: null });
    expect(syncShopConfig).toHaveBeenCalledWith("shop1");
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "CODE_CHANGED_WHILE_RUNNING", diff: { variant: "b", fields: ["js", "css"] } });
  });

  it("on DRAFT it is a plain UPDATE; ENDED is frozen", async () => {
    db.variant.findUnique.mockResolvedValue(variant("DRAFT"));
    expect((await saveVariantCode("v1", { js: "x" }, "joel")).hotfix).toBe(false);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("UPDATED");
    db.variant.findUnique.mockResolvedValue(variant("ENDED"));
    await expect(saveVariantCode("v1", { js: "x" }, "joel")).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("restores the old code when the sync fails", async () => {
    db.variant.findUnique.mockResolvedValue(variant("RUNNING"));
    syncShopConfig.mockRejectedValue(new Error("too big"));
    await expect(saveVariantCode("v1", { js: "huge" }, "joel")).rejects.toThrow("too big");
    expect(db.variant.update.mock.calls[1][0].data).toEqual({ js: "old", css: null });
  });
});

/**
 * Contract 4.6 as amended by ADR-0036. The asymmetry is the whole point: without it, lowering the threshold below the
 * current stand hands out a p-value on demand, and the fixed horizon of ADR-0018 means nothing.
 */
describe("setStoppingRule", () => {
  const at = (status: string, over: Partial<typeof RULE> = {}) => db.experiment.findUnique.mockResolvedValue({ ...base, status, ...RULE, ...over });

  it("tightening a RUNNING experiment is allowed and logged as STOPPING_RULE_CHANGED", async () => {
    at("RUNNING");
    const r = await setStoppingRule("e1", { minConversionsPerArm: 2_000 }, "joel@example.com");
    expect(r.changed).toBe(true);
    expect(db.experiment.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { minConversionsPerArm: 2_000, minDurationDays: 14, requireFullWeeks: true },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "STOPPING_RULE_CHANGED", actor: "joel@example.com" }) }),
    );
  });

  it("more days is tightening; switching full weeks ON is tightening", async () => {
    at("RUNNING", { requireFullWeeks: false });
    await expect(setStoppingRule("e1", { minDurationDays: 21, requireFullWeeks: true }, "joel")).resolves.toMatchObject({ changed: true });
  });

  it("refuses to lower the conversion target while RUNNING", async () => {
    at("RUNNING");
    await expect(setStoppingRule("e1", { minConversionsPerArm: 500 }, "joel")).rejects.toThrow(/only be tightened/);
    expect(db.experiment.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses to shorten the duration, to switch full weeks off, or to switch a condition off entirely", async () => {
    const loosenings: Partial<typeof RULE>[] = [
      { minDurationDays: 7 },
      { requireFullWeeks: false },
      { minConversionsPerArm: null },
      { minDurationDays: null },
    ];
    for (const loosening of loosenings) {
      at("RUNNING");
      await expect(setStoppingRule("e1", loosening, "joel")).rejects.toThrow(/only be tightened/);
    }
  });

  it("names every field that was loosened, not just the first", async () => {
    at("RUNNING");
    await expect(setStoppingRule("e1", { minConversionsPerArm: 100, minDurationDays: 3 }, "joel")).rejects.toThrow(
      /minConversionsPerArm, minDurationDays/,
    );
  });

  it("allows loosening in DRAFT and in PAUSED", async () => {
    for (const status of ["DRAFT", "PAUSED"]) {
      db.experiment.update.mockClear();
      at(status);
      await expect(setStoppingRule("e1", { minConversionsPerArm: 100, requireFullWeeks: false }, "joel")).resolves.toMatchObject({ changed: true });
      expect(db.experiment.update).toHaveBeenCalled();
    }
  });

  it("switching a condition ON from null is tightening, even while RUNNING", async () => {
    at("RUNNING", { minConversionsPerArm: null });
    await expect(setStoppingRule("e1", { minConversionsPerArm: 1_000 }, "joel")).resolves.toMatchObject({ changed: true });
  });

  it("a no-op writes nothing and logs nothing", async () => {
    at("RUNNING");
    const r = await setStoppingRule("e1", { minConversionsPerArm: 1_000, minDurationDays: 14, requireFullWeeks: true }, "joel");
    expect(r.changed).toBe(false);
    expect(db.experiment.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("an ENDED experiment is frozen – the rule its verdict was read at cannot move afterwards", async () => {
    at("ENDED");
    await expect(setStoppingRule("e1", { minConversionsPerArm: 2_000 }, "joel")).rejects.toThrow(/frozen/);
  });

  it("does not touch the storefront config – the snippet never sees the stopping rule", async () => {
    at("DRAFT");
    await setStoppingRule("e1", { minDurationDays: 28 }, "joel");
    expect(syncShopConfig).not.toHaveBeenCalled();
  });
});
