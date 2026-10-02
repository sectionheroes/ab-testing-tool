// Experiment mutations shared by dashboard, CLI and scripts (no business logic in routes). Every change that affects the
// storefront config ends in syncShopConfig(); contract 4.6 governs edits on RUNNING experiments.
import { randomBytes } from "node:crypto";
import type { Decision, Experiment, ExperimentStatus, Prisma, Variant } from "@prisma/client";
import type { StoppingRuleConfig } from "../../lib/stats";
import prisma from "../db.server";
import { logAudit } from "./audit.server";
import { freezeExperimentResult } from "./experiment-result.server";
import { fromTargeting, fromTrigger, toTargeting, toTrigger, type MetricKey } from "./experiment-input";
import { syncShopConfig, type SyncResult } from "./metafields.server";
import { stoppingRuleOf } from "./stats.server";

export class ExperimentError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "BAD_TRANSITION" | "DECISION_REQUIRED" | "LOCKED" | "KEY_TAKEN",
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

// ---------------------------------------------------------------------------------------------------------------
// Create / update – the experiment form (WP5a) and, from 5c, the CLI
// ---------------------------------------------------------------------------------------------------------------

/**
 * Contract 4.4: the salt fixes the bucketing and never changes afterwards. Four hex characters is what the metafield
 * schema (4.2) shows and what the snippet hashes; its only job is to make two experiments with the same key on the
 * same visitor fall differently, not to be unguessable.
 */
export function newSalt(): string {
  return randomBytes(2).toString("hex");
}

export type ExperimentWrite = {
  name: string;
  key: string;
  hypothesis: string | null;
  primaryMetric: MetricKey;
  targeting: Prisma.InputJsonValue;
  trigger: Prisma.InputJsonValue;
  hideUntilApplied: boolean;
  allocation: number;
  variants: { key: string; name: string; weight: number; isControl: boolean; js: string | null; css: string | null }[];
  stoppingRule: { minConversionsPerArm: number; minDurationDays: number; requireFullWeeks: boolean };
};

/** Keys already used in this shop – the form checks a new key against these before it offers to save. */
export async function takenExperimentKeys(shopId: string, exceptId?: string): Promise<string[]> {
  const rows = await prisma.experiment.findMany({
    where: { shopId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { key: true },
  });
  return rows.map((r) => r.key);
}

/**
 * Creates a DRAFT. Always a draft: the form has no Start (Joel, 01.10.) – starting is a separate, deliberate step on
 * the experiment's own page, where the stopping rule and the QA links are visible.
 *
 * No metafield write happens here, by contract 4.2: only RUNNING experiments are in the `client` metafield, so a
 * draft is invisible to the storefront until someone starts it.
 */
export async function createExperiment(shopId: string, input: ExperimentWrite, actor: string): Promise<Experiment> {
  const clash = await prisma.experiment.findUnique({ where: { shopId_key: { shopId, key: input.key } } });
  if (clash) throw new ExperimentError(`This key is already used in this shop: ${input.key}`, "KEY_TAKEN");

  const experiment = await prisma.experiment.create({
    data: {
      shopId,
      key: input.key,
      name: input.name,
      hypothesis: input.hypothesis,
      type: "CODE",
      status: "DRAFT",
      allocation: input.allocation,
      salt: newSalt(),
      targeting: input.targeting,
      trigger: input.trigger,
      hideUntilApplied: input.hideUntilApplied,
      primaryMetric: input.primaryMetric,
      ...input.stoppingRule,
      variants: {
        create: input.variants.map((v) => ({
          key: v.key,
          name: v.name,
          weight: v.weight,
          isControl: v.isControl,
          js: v.js,
          css: v.css,
        })),
      },
    },
  });
  await logAudit({ shopId, experimentId: experiment.id, actor, action: "CREATED", diff: { key: input.key, name: input.name } });
  return experiment;
}

/**
 * Saves the form on an existing experiment. **This is contract 4.6 in code**, and it is the only place that decides
 * what may still change:
 *
 *  - `ENDED` – nothing. The snapshot is frozen and the row behind it has to stay what the snapshot describes.
 *  - `RUNNING` – variant code only, with the three consequences of 4.6: a warning in the UI, a
 *    `CODE_CHANGED_WHILE_RUNNING` entry in the audit log, and an immediate metafield write so a hotfix actually
 *    reaches the storefront. Key, targeting, allocation, weights and salt are rejected rather than silently dropped,
 *    because they would move visitors between buckets mid-test.
 *  - `DRAFT` / `PAUSED` – everything.
 *
 * The stopping rule is **not** written here. It has its own guard (`setStoppingRule`, tighten-only while RUNNING per
 * ADR-0036) and this function calls it rather than reimplementing the comparison – a second copy of that rule is
 * exactly how a loophole gets introduced.
 */
export async function updateExperiment(
  experimentId: string,
  input: ExperimentWrite,
  actor: string,
): Promise<{ experiment: Experiment; sync: SyncResult | null; hotfix: boolean }> {
  const current = await prisma.experiment.findUnique({ where: { id: experimentId }, include: { variants: true } });
  if (!current) throw new ExperimentError("Experiment not found", "NOT_FOUND");
  if (current.status === "ENDED") throw new ExperimentError("Ended experiments are frozen", "LOCKED");

  const running = current.status === "RUNNING";
  if (running) {
    const locked = lockedChanges(current, input);
    if (locked.length > 0) {
      throw new ExperimentError(
        `A running experiment cannot change ${locked.join(", ")} – contract 4.6. Pause it first.`,
        "LOCKED",
      );
    }
  } else if (input.key !== current.key) {
    const clash = await prisma.experiment.findFirst({ where: { shopId: current.shopId, key: input.key, id: { not: experimentId } } });
    if (clash) throw new ExperimentError(`This key is already used in this shop: ${input.key}`, "KEY_TAKEN");
  }

  const before = snapshotForDiff(current);
  // Which variants' code this save actually changes, and in which field. The frozen snapshot reads exactly this to
  // place its "variant changed on <date>" marker (ADR-0025 via experiment-result.server), so the shape has to match
  // what `saveVariantCode` writes: one entry per variant, with `variant` and `fields`.
  const codeChanges = current.variants.flatMap((v) => {
    const next = input.variants.find((n) => n.key === v.key);
    if (!next) return [];
    const fields = [nullable(next.js) !== v.js ? "js" : null, nullable(next.css) !== v.css ? "css" : null].filter((f): f is string => f !== null);
    return fields.length > 0 ? [{ variant: v.key, fields }] : [];
  });

  const experiment = await prisma.$transaction(async (tx) => {
    const updated = await tx.experiment.update({
      where: { id: experimentId },
      data: {
        name: input.name,
        hypothesis: input.hypothesis,
        primaryMetric: input.primaryMetric,
        ...(running
          ? {}
          : {
              key: input.key,
              targeting: input.targeting,
              trigger: input.trigger,
              hideUntilApplied: input.hideUntilApplied,
              allocation: input.allocation,
            }),
      },
    });

    for (const v of input.variants) {
      const existing = current.variants.find((e) => e.key === v.key);
      if (existing) {
        await tx.variant.update({
          where: { id: existing.id },
          data: {
            name: v.name,
            js: nullable(v.js),
            css: nullable(v.css),
            ...(running ? {} : { weight: v.weight, isControl: v.isControl }),
          },
        });
      } else if (!running) {
        await tx.variant.create({
          data: { experimentId, key: v.key, name: v.name, weight: v.weight, isControl: v.isControl, js: nullable(v.js), css: nullable(v.css) },
        });
      }
    }
    if (!running) {
      const removed = current.variants.filter((e) => !input.variants.some((v) => v.key === e.key));
      for (const v of removed) {
        // Exposures and attributions point at a variant. Deleting one that has either would orphan collected data,
        // so a variant that has ever been served stays – the form only offers removal on a draft.
        const used = await tx.exposure.count({ where: { variantId: v.id } });
        if (used === 0) await tx.variant.delete({ where: { id: v.id } });
      }
    }
    return updated;
  });

  // The metafield is only written for RUNNING experiments (4.2); for anything else there is nothing to push, and a
  // failed write must not hold up a draft edit.
  let sync: SyncResult | null = null;
  if (running) sync = await syncShopConfig(current.shopId);

  const after = snapshotForDiff({ ...current, ...experiment });
  if (JSON.stringify(before) !== JSON.stringify(after) || (!running && codeChanges.length > 0)) {
    await logAudit({
      shopId: current.shopId,
      experimentId,
      actor,
      action: "UPDATED",
      diff: { from: before, to: after, ...(codeChanges.length > 0 ? { variants: codeChanges } : {}) },
    });
  }
  // One entry per changed variant while RUNNING – contract 4.6's marker is per variant, not per save.
  for (const change of running ? codeChanges : []) {
    await logAudit({ shopId: current.shopId, experimentId, actor, action: "CODE_CHANGED_WHILE_RUNNING", diff: change });
  }
  return { experiment, sync, hotfix: running && codeChanges.length > 0 };
}

const nullable = (v: string | null | undefined) => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Stable comparison of two plain objects – key order is not a change. */
const sameJson = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/** Which of the 4.6-locked fields the submitted form would change. Empty means the save is a code-only hotfix. */
function lockedChanges(
  current: Experiment & { variants: Variant[] },
  input: ExperimentWrite,
): string[] {
  const changed: string[] = [];
  if (input.key !== current.key) changed.push("key");
  // Both sides go through the same normalisation before they are compared. Otherwise a row whose `targeting` was
  // written by an older path (the WP2 seed stores `{}`) or simply in another key order looks changed when nothing
  // changed, and a running experiment could not be hotfixed at all – which is the one thing 4.6 keeps open.
  if (!sameJson(toTargeting(fromTargeting(input.targeting)), toTargeting(fromTargeting(current.targeting)))) changed.push("targeting");
  if (!sameJson(toTrigger(fromTrigger(input.trigger)), toTrigger(fromTrigger(current.trigger)))) changed.push("trigger");
  if (input.hideUntilApplied !== current.hideUntilApplied) changed.push("hideUntilApplied");
  if (Math.abs(input.allocation - current.allocation) > 1e-9) changed.push("allocation");
  const sameArms =
    input.variants.length === current.variants.length &&
    input.variants.every((v) => {
      const existing = current.variants.find((e) => e.key === v.key);
      return existing !== undefined && Math.abs(existing.weight - v.weight) <= 1e-9 && existing.isControl === v.isControl;
    });
  if (!sameArms) changed.push("weights");
  return changed;
}

function snapshotForDiff(experiment: Experiment) {
  return {
    name: experiment.name,
    key: experiment.key,
    hypothesis: experiment.hypothesis,
    primaryMetric: experiment.primaryMetric,
    allocation: experiment.allocation,
    targeting: experiment.targeting,
    trigger: experiment.trigger,
    hideUntilApplied: experiment.hideUntilApplied,
  };
}
