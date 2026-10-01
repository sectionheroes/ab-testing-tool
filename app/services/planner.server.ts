/**
 * What the "When is it decided?" card needs from the database: the shop's own baseline conversion rate, the pace of
 * its last test, and the order history σ for the revenue metrics. The arithmetic on top of these numbers is in
 * `planner.ts`, which is pure and runs in the browser while the form is being typed into.
 *
 * Both the baseline and the pace are **taken from an earlier test in the same shop**, never estimated. Two reasons:
 * we only ever see the visitors of a running experiment, not the shop's whole traffic (ADR-0036), and a made-up
 * baseline would quietly change the runtime the planner promises. A shop without an earlier test gets null and the
 * form asks for the number instead of guessing (Figma state 5).
 */
import { evaluateStoppingRule } from "../../lib/stats";
import prisma from "../db.server";
import type { FrozenSnapshot } from "./experiment-result.server";
import { listCounts, rpvPlanningInputs, stoppingRuleOf, type Db } from "./stats.server";
import type { OrderStats } from "./planner";

/** How many earlier tests to look at before giving up. Newest first; the first usable one wins. */
const CANDIDATES = 5;

export type PlanningContext = {
  /** Control conversion rate of the most recent usable test, with the name it came from (shown as the source). */
  baseline: { cr: number; source: string } | null;
  /** Converting visitors per day in the slower arm of that test – the "pace" the runtime estimate is built on. */
  pace: { convertersPerDay: number; source: string } | null;
  orderStats: OrderStats;
};

export async function planningContext(shopId: string, opts: { now?: Date; db?: Db } = {}): Promise<PlanningContext> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  const timezone = shop?.timezone ?? "UTC";

  const candidates = await db.experiment.findMany({
    where: { shopId, startedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: CANDIDATES,
    include: { variants: { orderBy: { key: "asc" } }, result: true },
  });

  // One batched query for every candidate that has no frozen snapshot; the frozen ones already carry their numbers.
  const live = candidates.filter((e) => !e.result);
  const counts = live.length > 0 ? await listCounts(live.map((e) => ({ id: e.id, startedAt: e.startedAt, endedAt: e.endedAt })), { now, db }) : [];

  let baseline: PlanningContext["baseline"] = null;
  let pace: PlanningContext["pace"] = null;

  for (const experiment of candidates) {
    if (baseline && pace) break;
    const read = experiment.result
      ? fromSnapshot(experiment.result.snapshot as unknown as FrozenSnapshot)
      : fromCounts(experiment, counts, timezone, now);
    if (!read) continue;
    if (!baseline && read.controlCr > 0) baseline = { cr: read.controlCr, source: experiment.name };
    if (!pace && read.convertersPerDay !== null && read.convertersPerDay > 0) {
      pace = { convertersPerDay: read.convertersPerDay, source: experiment.name };
    }
  }

  const planning = await rpvPlanningInputs(shopId, { now, db });
  return {
    baseline,
    pace,
    orderStats: { orders: planning.orders, aov: planning.aov, aovSd: planning.aovSd, secondMoment: planning.secondMoment },
  };
}

type Reading = { controlCr: number; convertersPerDay: number | null };

function fromSnapshot(snapshot: FrozenSnapshot): Reading | null {
  const control = snapshot.numbers?.variants?.find((v) => v.isControl);
  if (!control) return null;
  const rule = snapshot.numbers.stoppingRule;
  const days = rule?.elapsedDays ?? null;
  return {
    controlCr: control.cr,
    convertersPerDay: days !== null && days > 0 && rule.converterFloor > 0 ? rule.converterFloor / days : null,
  };
}

function fromCounts(
  experiment: { id: string; startedAt: Date | null; endedAt: Date | null; variants: { id: string; isControl: boolean }[] } & Record<string, unknown>,
  counts: { experimentId: string; variantId: string; visitors: number; converters: number }[],
  timezone: string,
  now: Date,
): Reading | null {
  const mine = counts.filter((c) => c.experimentId === experiment.id);
  if (mine.length === 0) return null;
  const control = experiment.variants.find((v) => v.isControl);
  const controlRow = control ? mine.find((c) => c.variantId === control.id) : undefined;
  const controlCr = controlRow && controlRow.visitors > 0 ? controlRow.converters / controlRow.visitors : 0;

  // The stopping rule gives the two numbers the pace is made of – converting visitors in the slower arm, and the
  // elapsed days in the shop's timezone. Reusing it keeps one definition of "how far along is this test".
  const rule = evaluateStoppingRule({
    ...stoppingRuleOf(experiment as never),
    startedAt: experiment.startedAt,
    now: experiment.endedAt ?? now,
    timezone,
    convertersPerArm: mine.map((c) => c.converters),
  });
  const days = rule.elapsedDays;
  return {
    controlCr,
    convertersPerDay: days !== null && days > 0 && rule.converterFloor > 0 ? rule.converterFloor / days : null,
  };
}
