// Experiment mutations shared by dashboard, CLI and scripts (no business logic in routes). Every change that affects the
// storefront config ends in syncShopConfig(); contract 4.6 governs edits on RUNNING experiments.
import type { Decision, Experiment, ExperimentStatus, Prisma, Variant } from "@prisma/client";
import prisma from "../db.server";
import { logAudit } from "./audit.server";
import { syncShopConfig, type SyncResult } from "./metafields.server";

export class ExperimentError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "BAD_TRANSITION" | "DECISION_REQUIRED" | "LOCKED",
  ) {
    super(message);
  }
}

const TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  DRAFT: ["RUNNING"],
  RUNNING: ["PAUSED", "ENDED"],
  PAUSED: ["RUNNING", "ENDED"],
  ENDED: [],
};

export function getExperiment(shopId: string, key: string) {
  return prisma.experiment.findUnique({ where: { shopId_key: { shopId, key } }, include: { variants: true } });
}

/**
 * Status change. startedAt is set on the first transition to RUNNING and never moved (attribution window 4.8 starts
 * there); endedAt is set on ENDED and closes the window. ENDED needs a decision (plan §3). The DB change is rolled back
 * if the metafield write fails, so the DB never says RUNNING while the storefront does not know.
 * The ExperimentResult snapshot on ENDED is WP4 (stats engine) – not written here.
 */
export async function setExperimentStatus(
  experimentId: string,
  status: ExperimentStatus,
  actor: string,
  opts: { decision?: Decision; conclusion?: string } = {},
): Promise<{ experiment: Experiment; sync: SyncResult }> {
  const current = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!current) throw new ExperimentError("Experiment not found", "NOT_FOUND");
  if (!TRANSITIONS[current.status].includes(status)) {
    throw new ExperimentError(`Cannot go from ${current.status} to ${status}`, "BAD_TRANSITION");
  }
  if (status === "ENDED" && !opts.decision) throw new ExperimentError("Ending an experiment requires a decision", "DECISION_REQUIRED");

  const now = new Date();
  const data: Prisma.ExperimentUpdateInput = { status };
  if (status === "RUNNING" && !current.startedAt) data.startedAt = now;
  if (status === "ENDED") {
    data.endedAt = now;
    data.decision = opts.decision;
    if (opts.conclusion !== undefined) data.conclusion = opts.conclusion;
  }
  const experiment = await prisma.experiment.update({ where: { id: experimentId }, data });

  let sync: SyncResult;
  try {
    sync = await syncShopConfig(current.shopId);
  } catch (err) {
    await prisma.experiment.update({
      where: { id: experimentId },
      data: { status: current.status, startedAt: current.startedAt, endedAt: current.endedAt, decision: current.decision, conclusion: current.conclusion },
    });
    throw err;
  }
  await logAudit({
    shopId: current.shopId,
    experimentId,
    actor,
    action: "STATUS_CHANGED",
    diff: { from: current.status, to: status, ...(opts.decision ? { decision: opts.decision } : {}) },
  });
  return { experiment, sync };
}

/**
 * Code save (contract 4.6): allowed in every status but ENDED. On RUNNING it is a hotfix – AuditLog gets
 * CODE_CHANGED_WHILE_RUNNING (the report marker reads that entry) and the metafield is updated immediately.
 */
export async function saveVariantCode(
  variantId: string,
  code: { js?: string | null; css?: string | null },
  actor: string,
): Promise<{ variant: Variant; sync: SyncResult; hotfix: boolean }> {
  const current = await prisma.variant.findUnique({ where: { id: variantId }, include: { experiment: true } });
  if (!current) throw new ExperimentError("Variant not found", "NOT_FOUND");
  if (current.experiment.status === "ENDED") throw new ExperimentError("Ended experiments are frozen", "LOCKED");

  const data: { js?: string | null; css?: string | null } = {};
  if (code.js !== undefined) data.js = code.js === "" ? null : code.js;
  if (code.css !== undefined) data.css = code.css === "" ? null : code.css;
  const variant = await prisma.variant.update({ where: { id: variantId }, data });

  const hotfix = current.experiment.status === "RUNNING";
  let sync: SyncResult;
  try {
    sync = await syncShopConfig(current.experiment.shopId);
  } catch (err) {
    await prisma.variant.update({ where: { id: variantId }, data: { js: current.js, css: current.css } });
    throw err;
  }
  await logAudit({
    shopId: current.experiment.shopId,
    experimentId: current.experimentId,
    actor,
    action: hotfix ? "CODE_CHANGED_WHILE_RUNNING" : "UPDATED",
    diff: { variant: current.key, fields: Object.keys(data) },
  });
  return { variant, sync, hotfix };
}
