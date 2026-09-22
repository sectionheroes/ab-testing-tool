import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  experiment: { findUnique: vi.fn(), update: vi.fn() },
  variant: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
};
vi.mock("../db.server", () => ({ default: db }));
const syncShopConfig = vi.fn();
vi.mock("./metafields.server", () => ({ syncShopConfig }));
const { setExperimentStatus, saveVariantCode, ExperimentError } = await import("./experiments.server");

const base = { id: "e1", shopId: "shop1", key: "demo-test", status: "DRAFT", startedAt: null, endedAt: null, decision: null, conclusion: null };
const ok = { skipped: false, bytes: 1, experiments: 1, updatedAt: "t", config: {} };

beforeEach(() => {
  for (const m of [db.experiment.findUnique, db.experiment.update, db.variant.findUnique, db.variant.update, db.auditLog.create, syncShopConfig]) m.mockReset();
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
