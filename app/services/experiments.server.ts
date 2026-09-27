// Experiment mutations shared by dashboard, CLI and scripts (no business logic in routes). Every change that affects the
// storefront config ends in syncShopConfig(); contract 4.6 governs edits on RUNNING experiments.
import type { Decision, Experiment, ExperimentStatus, Prisma, Variant } from "@prisma/client";
import type { StoppingRuleConfig } from "../../lib/stats";
import prisma from "../db.server";
import { logAudit } from "./audit.server";
import { freezeExperimentResult } from "./experiment-result.server";
import { syncShopConfig, type SyncResult } from "./metafields.server";
import { stoppingRuleOf } from "./stats.server";

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
 *
 * On ENDED the frozen ExperimentResult snapshot is written in the SAME transaction as the status change (ADR-0025),
 * with the evaluation window closing at the endedAt we just set. freezeExperimentResult never overwrites an existing
 * snapshot, so a retried transition cannot change a result that was already reported.
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
  const { experiment, frozenResultId } = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.experiment.update({ where: { id: experimentId }, data });
      if (status !== "ENDED") return { experiment: updated, frozenResultId: null as string | null };
      const frozen = await freezeExperimentResult(experimentId, { now, db: tx });
      return { experiment: updated, frozenResultId: frozen.created ? frozen.id : null };
    },
    // The snapshot runs the full live aggregation, which is allowed up to 500 ms at a million exposures (ADR-0019);
    // the default 5 s interactive-transaction budget is too tight for the slowest shop plus its round trips.
    { timeout: 30_000, maxWait: 10_000 },
  );

  let sync: SyncResult;
  try {
    sync = await syncShopConfig(current.shopId);
  } catch (err) {
    await prisma.experiment.update({
      where: { id: experimentId },
      data: { status: current.status, startedAt: current.startedAt, endedAt: current.endedAt, decision: current.decision, conclusion: current.conclusion },
    });
    // Undo only a snapshot this very call created – an older one is never touched (ADR-0025).
    if (frozenResultId) await prisma.experimentResult.delete({ where: { id: frozenResultId } });
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

/**
 * Stopping-rule change (contract 4.6 as amended by ADR-0036). On `RUNNING` the rule may only become **stricter** –
 * more conversions, more days, full weeks switched on. Loosening is allowed in `DRAFT` and `PAUSED` only.
 *
 * Without that asymmetry the whole fixed-horizon construction has a back door: set the threshold below where the
 * experiment already stands and the p-value unlocks itself. Every change is an `STOPPING_RULE_CHANGED` AuditLog entry,
 * which is also what the report reads to mark it.
 *
 * The rule is config, not storefront behaviour, so no metafield sync – the snippet never sees it.
 */
export async function setStoppingRule(
  experimentId: string,
  rule: Partial<StoppingRuleConfig>,
  actor: string,
): Promise<{ experiment: Experiment; changed: boolean }> {
  const current = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!current) throw new ExperimentError("Experiment not found", "NOT_FOUND");
  if (current.status === "ENDED") throw new ExperimentError("Ended experiments are frozen", "LOCKED");

  const before = stoppingRuleOf(current);
  const next: StoppingRuleConfig = {
    minConversionsPerArm: rule.minConversionsPerArm === undefined ? before.minConversionsPerArm : rule.minConversionsPerArm,
    minDurationDays: rule.minDurationDays === undefined ? before.minDurationDays : rule.minDurationDays,
    requireFullWeeks: rule.requireFullWeeks === undefined ? before.requireFullWeeks : rule.requireFullWeeks,
  };

  if (current.status === "RUNNING") {
    // null means "no condition": switching a condition off is always a loosening, switching one on always a tightening.
    const looser = (from: number | null, to: number | null) => (from == null ? false : to == null || to < from);
    const loosened: string[] = [];
    if (looser(before.minConversionsPerArm, next.minConversionsPerArm)) loosened.push("minConversionsPerArm");
    if (looser(before.minDurationDays, next.minDurationDays)) loosened.push("minDurationDays");
    if (before.requireFullWeeks && !next.requireFullWeeks) loosened.push("requireFullWeeks");
    if (loosened.length > 0) {
      throw new ExperimentError(
        `A running experiment's stopping rule can only be tightened, never loosened (${loosened.join(", ")}) – contract 4.6 / ADR-0036. Pause it first.`,
        "LOCKED",
      );
    }
  }

  const unchanged =
    before.minConversionsPerArm === next.minConversionsPerArm &&
    before.minDurationDays === next.minDurationDays &&
    before.requireFullWeeks === next.requireFullWeeks;
  if (unchanged) return { experiment: current, changed: false };

  const experiment = await prisma.experiment.update({ where: { id: experimentId }, data: next });
  await logAudit({
    shopId: current.shopId,
    experimentId,
    actor,
    action: "STOPPING_RULE_CHANGED",
    diff: { from: before, to: next, status: current.status },
  });
  return { experiment, changed: true };
}
