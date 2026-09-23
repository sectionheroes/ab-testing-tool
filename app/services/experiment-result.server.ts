/**
 * The frozen result snapshot (ADR-0025, rahmen §3.2). Written once when an experiment goes to ENDED, in the same
 * transaction as the status change, and never recomputed – a report from two years ago has to keep showing the
 * numbers it showed back then, even after lib/stats changed. The raw data underneath may be gone by then
 * (Exposure retention is 12 months, ADR-0024); the snapshot is what survives, including `shop/redact`.
 *
 * Rule: results are never recomputed, only read. `freezeExperimentResult` is therefore idempotent – a second call
 * returns the existing snapshot untouched.
 */
import type { Prisma } from "@prisma/client";
import { STATS_VERSION } from "../../lib/stats";
import prisma from "../db.server";
import { computeStatsFor, loadExperimentForStats, taintedDays, type Db, type ExperimentStats } from "./stats.server";

/** Schema version of the snapshot envelope itself (plan §3: starts at 1). Independent of STATS_VERSION. */
export const SNAPSHOT_VERSION = 1;

export type FrozenSnapshot = {
  /** evaluate() output plus the device-link disclosure from stats.server (ADR-0032). JSON-safe by construction. */
  numbers: ExperimentStats;
  /** What the test actually was – Variant is editable, so without this copy it is unknowable later. */
  frozen: {
    hypothesis: string | null;
    primaryMetric: string;
    plannedSampleSize: number | null;
    variants: { key: string; name: string; weight: number; isControl: boolean; js: string | null; css: string | null }[];
    targeting: Prisma.JsonValue;
    allocation: number;
    salt: string;
    trigger: Prisma.JsonValue;
    hideUntilApplied: boolean;
    startedAt: string | null;
    endedAt: string | null;
    taintedDays: string[];
    /** Every CODE_CHANGED_WHILE_RUNNING entry – contract 4.6's "variant changed on <date>" marker. */
    codeChanges: { at: string; actor: string; variantKey: string | null }[];
  };
  verdict: { decision: string | null; conclusion: string | null };
};

type CodeChangeDiff = { variant?: unknown };

/**
 * Computes evaluate() once and stores it. Returns the existing row if there is one – existing snapshots are never
 * overwritten, not even by a later call with better data.
 *
 * `opts.now` closes the evaluation window; pass the same timestamp the ENDED transition uses so the snapshot's window
 * and `Experiment.endedAt` agree.
 */
export async function freezeExperimentResult(
  experimentId: string,
  opts: { now?: Date; db?: Db } = {},
): Promise<{ id: string; created: boolean; statsVersion: string; snapshot: FrozenSnapshot }> {
  const db = opts.db ?? prisma;

  const existing = await db.experimentResult.findUnique({ where: { experimentId } });
  if (existing) {
    return { id: existing.id, created: false, statsVersion: existing.statsVersion, snapshot: existing.snapshot as unknown as FrozenSnapshot };
  }

  const experiment = await loadExperimentForStats(experimentId, db);
  if (!experiment) throw new Error(`freezeExperimentResult: experiment ${experimentId} not found`);

  const now = opts.now ?? new Date();
  const stats = await computeStatsFor(experiment, { now, db });

  const codeChangeRows = await db.auditLog.findMany({
    where: { experimentId, action: "CODE_CHANGED_WHILE_RUNNING" },
    orderBy: { at: "asc" },
    select: { at: true, actor: true, diff: true },
  });

  const snapshot: FrozenSnapshot = {
    numbers: { ...stats },
    frozen: {
      hypothesis: experiment.hypothesis,
      primaryMetric: experiment.primaryMetric,
      plannedSampleSize: experiment.plannedSampleSize,
      variants: experiment.variants.map((v) => ({
        key: v.key,
        name: v.name,
        weight: v.weight,
        isControl: v.isControl,
        js: v.js,
        css: v.css,
      })),
      targeting: experiment.targeting,
      allocation: experiment.allocation,
      salt: experiment.salt,
      trigger: experiment.trigger,
      hideUntilApplied: experiment.hideUntilApplied,
      startedAt: experiment.startedAt?.toISOString() ?? null,
      endedAt: (experiment.endedAt ?? now).toISOString(),
      taintedDays: taintedDays(experiment),
      codeChanges: codeChangeRows.map((row) => ({
        at: row.at.toISOString(),
        actor: row.actor,
        variantKey: typeof (row.diff as CodeChangeDiff | null)?.variant === "string" ? ((row.diff as CodeChangeDiff).variant as string) : null,
      })),
    },
    verdict: { decision: experiment.decision, conclusion: experiment.conclusion },
  };

  try {
    const created = await db.experimentResult.create({
      data: {
        experimentId,
        shopId: experiment.shopId,
        v: SNAPSHOT_VERSION,
        statsVersion: STATS_VERSION,
        frozenAt: now,
        snapshot: snapshot as unknown as Prisma.InputJsonObject,
      },
    });
    return { id: created.id, created: true, statsVersion: STATS_VERSION, snapshot };
  } catch (err) {
    // Unique violation on experimentId: someone froze it between our read and our write. Theirs wins, by the rule.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      const raced = await db.experimentResult.findUniqueOrThrow({ where: { experimentId } });
      return { id: raced.id, created: false, statsVersion: raced.statsVersion, snapshot: raced.snapshot as unknown as FrozenSnapshot };
    }
    throw err;
  }
}

/** Reads the snapshot. ENDED experiments show this and nothing else (ADR-0025). */
export async function getExperimentResult(experimentId: string, db: Db = prisma) {
  return db.experimentResult.findUnique({ where: { experimentId } });
}
