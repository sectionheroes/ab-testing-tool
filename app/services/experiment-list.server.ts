/**
 * The experiments list (WP5a, Figma `Experiments` 2-21). Everything a row shows is decided here, not in the route —
 * the CLI's `sh-ab status` (5c) prints the same verdicts and must not reinvent them.
 *
 * The expensive part of this page is the Result column, and it is built in three tiers so a list of twenty rows is
 * not twenty full aggregations:
 *
 *  1. `DRAFT` needs nothing. No numbers exist.
 *  2. `ENDED` reads the **frozen snapshot** and nothing else (ADR-0025). Results are never recomputed.
 *  3. `RUNNING` / `PAUSED` get the cheap batched counts of `listCounts()`, which answer the stopping-rule progress
 *     and the SRM check. Only the few rows whose rule is already **met** need a verdict, and only those pay for a
 *     full `computeExperimentStats()`.
 *
 * What the Result column may say is ADR-0036 and ADR-0037, not taste: before the stopping rule is met there is no
 * winner and no colour, because colour is a verdict. SRM switches the verdict off entirely (4.10 / ADR-0037) — a
 * broken assignment means the arms are not comparable, so the row says so instead of showing a number.
 */
import type { Decision, Experiment, ExperimentStatus, Shop, Variant } from "@prisma/client";
import { evaluateStoppingRule, srmCheck, type Metric } from "../../lib/stats";
import prisma from "../db.server";
import type { FrozenSnapshot } from "./experiment-result.server";
import { METRIC_LABELS, type MetricKey } from "./experiment-input";
import { computeExperimentStats, listCounts, stoppingRuleOf, taintedDays, type Db } from "./stats.server";

/** Running first, then paused, draft, ended (Figma 2-21). Within a group: newest activity first. */
const STATUS_ORDER: Record<ExperimentStatus, number> = { RUNNING: 0, PAUSED: 1, DRAFT: 2, ENDED: 3 };

/** A row whose rule is met needs a full aggregation; cap it so one page can never turn into a minute of queries. */
const MAX_VERDICT_COMPUTATIONS = 12;

export type ResultTone = "neutral" | "positive" | "negative";

export type ResultCell = {
  kind: "none" | "progress" | "srm" | "verdict";
  /** The line in the Result column. null renders as the em dash placeholder. */
  headline: string | null;
  /** The small line underneath. */
  note: string | null;
  tone: ResultTone;
  /** 0–1 against `minConversionsPerArm`, measured on the **smaller arm** (ADR-0036/0037). */
  progress: number | null;
};

export type ExperimentRow = {
  id: string;
  key: string;
  name: string;
  status: ExperimentStatus;
  shop: { id: string; name: string; domain: string };
  primaryMetric: MetricKey;
  startedAt: string | null;
  endedAt: string | null;
  pausedAt: string | null;
  runtimeDays: number | null;
  conversions: number | null;
  result: ResultCell;
};

export type ShopCount = { id: string; name: string; domain: string; experiments: number };

type ExperimentWithRels = Experiment & { shop: Pick<Shop, "id" | "name" | "domain" | "timezone">; variants: Variant[] };

export async function listExperiments(
  opts: { shopId?: string | null; now?: Date; db?: Db } = {},
): Promise<ExperimentRow[]> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();

  const experiments = (await db.experiment.findMany({
    where: opts.shopId ? { shopId: opts.shopId } : {},
    include: {
      shop: { select: { id: true, name: true, domain: true, timezone: true } },
      variants: { orderBy: { key: "asc" } },
      result: true,
    },
    orderBy: { createdAt: "desc" },
  })) as (ExperimentWithRels & { result: { snapshot: unknown } | null })[];

  const live = experiments.filter((e) => e.status === "RUNNING" || e.status === "PAUSED");
  // `listCounts` cannot subtract tainted days (ADR-0026); those few experiments take the full aggregation instead.
  const batched = live.filter((e) => taintedDays(e).length === 0);
  const counts = batched.length > 0 ? await listCounts(batched.map((e) => ({ id: e.id, startedAt: e.startedAt, endedAt: e.endedAt })), { now, db }) : [];
  const pausedAt = await lastPausedAt(
    experiments.filter((e) => e.status === "PAUSED").map((e) => e.id),
    db,
  );

  const rows: ExperimentRow[] = [];
  let verdictBudget = MAX_VERDICT_COMPUTATIONS;

  for (const experiment of experiments) {
    const metric = experiment.primaryMetric as MetricKey;
    const base = {
      id: experiment.id,
      key: experiment.key,
      name: experiment.name,
      status: experiment.status,
      shop: { id: experiment.shop.id, name: experiment.shop.name, domain: experiment.shop.domain },
      primaryMetric: metric,
      startedAt: experiment.startedAt?.toISOString() ?? null,
      endedAt: experiment.endedAt?.toISOString() ?? null,
      pausedAt: pausedAt.get(experiment.id)?.toISOString() ?? null,
    };

    if (experiment.status === "DRAFT") {
      rows.push({ ...base, runtimeDays: null, conversions: null, result: emptyCell() });
      continue;
    }

    if (experiment.status === "ENDED") {
      const snapshot = experiment.result?.snapshot as FrozenSnapshot | undefined;
      rows.push({
        ...base,
        runtimeDays: daysBetweenDates(experiment.startedAt, experiment.endedAt),
        conversions: snapshot ? snapshot.numbers.variants.reduce((s, v) => s + v.converters, 0) : null,
        result: endedCell(experiment.decision, snapshot, metric),
      });
      continue;
    }

    const endOfWindow = experiment.status === "PAUSED" ? (pausedAt.get(experiment.id) ?? now) : now;
    const mine = counts.filter((c) => c.experimentId === experiment.id);
    const hasBatched = batched.some((e) => e.id === experiment.id);

    let convertersPerArm: number[];
    let visitorsPerArm: number[];
    if (hasBatched) {
      convertersPerArm = experiment.variants.map((v) => mine.find((c) => c.variantId === v.id)?.converters ?? 0);
      visitorsPerArm = experiment.variants.map((v) => mine.find((c) => c.variantId === v.id)?.visitors ?? 0);
    } else {
      const stats = await computeExperimentStats(experiment.id, { now, db });
      convertersPerArm = stats.variants.map((v) => v.converters);
      visitorsPerArm = stats.variants.map((v) => v.visitors);
    }

    const rule = evaluateStoppingRule({
      ...stoppingRuleOf(experiment),
      startedAt: experiment.startedAt,
      now: endOfWindow,
      timezone: experiment.shop.timezone ?? "UTC",
      convertersPerArm,
    });
    const srm = srmCheck(visitorsPerArm, experiment.variants.map((v) => v.weight));

    let result: ResultCell;
    if (srm.alarm) {
      result = { kind: "srm", headline: "Assignment broken", note: "No verdict", tone: "negative", progress: null };
    } else if (rule.met && verdictBudget > 0) {
      verdictBudget--;
      const stats = await computeExperimentStats(experiment.id, { now: endOfWindow, db });
      result = readyCell(stats.winner, stats.variants, metric, experiment.status);
    } else {
      result = progressCell(rule, experiment.status);
    }

    rows.push({
      ...base,
      runtimeDays: rule.elapsedDays,
      conversions: convertersPerArm.reduce((s, n) => s + n, 0),
      result,
    });
  }

  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (sortDate(b) ?? 0) - (sortDate(a) ?? 0) ||
      a.name.localeCompare(b.name, "de-DE"),
  );
}

const sortDate = (row: ExperimentRow) => {
  const value = row.endedAt ?? row.startedAt;
  return value ? Date.parse(value) : null;
};

const emptyCell = (): ResultCell => ({ kind: "none", headline: null, note: null, tone: "neutral", progress: null });

/**
 * Running or paused, rule not met yet. The bar is the share of `minConversionsPerArm` the **slower** arm has
 * reached; a bar on the faster arm would say the test is further along than it is.
 */
function progressCell(
  rule: { converterFloor: number; minConversionsPerArm: number | null; evaluableOn: string | null },
  status: ExperimentStatus,
): ResultCell {
  const target = rule.minConversionsPerArm;
  const progress = target && target > 0 ? Math.min(rule.converterFloor / target, 1) : null;
  const note =
    status === "PAUSED"
      ? "not collecting while paused"
      : rule.evaluableOn
        ? `est. ${formatDay(rule.evaluableOn)}`
        : null;
  return { kind: "progress", headline: null, note, tone: "neutral", progress };
}

/** The stopping rule is met: the row may finally name a winner, and may finally use colour for it (ADR-0037). */
function readyCell(
  winner: string | null,
  variants: { key: string; isControl: boolean; metrics: Record<Metric, { lift: number | null }> }[],
  metric: MetricKey,
  status: ExperimentStatus,
): ResultCell {
  const note = status === "PAUSED" ? "paused · ready to stop" : "Ready to stop";
  if (!winner) return { kind: "verdict", headline: "No clear difference", note, tone: "neutral", progress: null };
  const lift = variants.find((v) => v.key === winner)?.metrics[metric as Metric]?.lift ?? null;
  return { kind: "verdict", headline: `${winner.toUpperCase()} wins${lift === null ? "" : ` · ${formatLift(lift)}`}`, note, tone: "positive", progress: null };
}

/**
 * An ended experiment says what was decided, not what the statistics said – the decision is the human's (plan §3,
 * mandatory on stop). The metric underneath names what the lift refers to; a loss that was significant is spelled
 * out rather than hidden behind "no clear difference".
 */
function endedCell(decision: Decision | null, snapshot: FrozenSnapshot | undefined, metric: MetricKey): ResultCell {
  const numbers = snapshot?.numbers;
  const winner = numbers?.winner ?? null;
  const lift = winner ? (numbers?.variants.find((v) => v.key === winner)?.metrics[metric as Metric]?.lift ?? null) : null;

  if (decision === "WINNER" && winner) {
    return {
      kind: "verdict",
      headline: `${winner.toUpperCase()} shipped${lift === null ? "" : ` · ${formatLift(lift)}`}`,
      note: METRIC_LABELS[metric],
      tone: "positive",
      progress: null,
    };
  }
  if (decision === "WINNER") {
    return { kind: "verdict", headline: "Variant shipped", note: METRIC_LABELS[metric], tone: "positive", progress: null };
  }
  if (decision === "NO_DIFFERENCE") {
    const worse = numbers?.variants.find((v) => !v.isControl && v.significant && (v.metrics[metric as Metric]?.lift ?? 0) < 0);
    const worseLift = worse?.metrics[metric as Metric]?.lift ?? null;
    return {
      kind: "verdict",
      headline: "Control kept",
      note: worse && worseLift !== null ? `${worse.key.toUpperCase()} was worse · ${formatLift(worseLift)}` : "No clear difference",
      tone: "neutral",
      progress: null,
    };
  }
  if (decision === "INVALID") return { kind: "verdict", headline: "Stopped as invalid", note: "No verdict", tone: "negative", progress: null };
  if (decision === "ABORTED") return { kind: "verdict", headline: "Stopped early", note: "No verdict", tone: "neutral", progress: null };
  return emptyCell();
}

/** Latest STATUS_CHANGED into PAUSED per experiment – the list shows "paused <date>" instead of the start date. */
async function lastPausedAt(experimentIds: string[], db: Db): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (experimentIds.length === 0) return out;
  const rows = await db.auditLog.findMany({
    where: { experimentId: { in: experimentIds }, action: "STATUS_CHANGED" },
    orderBy: { at: "desc" },
    select: { experimentId: true, at: true, diff: true },
  });
  for (const row of rows) {
    if (!row.experimentId || out.has(row.experimentId)) continue;
    if ((row.diff as { to?: string } | null)?.to === "PAUSED") out.set(row.experimentId, row.at);
  }
  return out;
}

export function daysBetweenDates(from: Date | null, to: Date | null): number | null {
  if (!from) return null;
  const end = to ?? new Date();
  return Math.max(0, Math.round((end.getTime() - from.getTime()) / 86_400_000));
}

const liftFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: "exceptZero" });
export const formatLift = (lift: number) => `${liftFmt.format(lift * 100)} %`;

const dayFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
/** `YYYY-MM-DD` (shop timezone, from the stopping rule) → `DD.MM.YYYY` (ADR-0022). */
export const formatDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

/** Shops for the switcher: ACTIVE only (ADR-0038), each with the number of experiments it has. */
export async function listShopsForSwitcher(db: Db = prisma): Promise<ShopCount[]> {
  const shops = await db.shop.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, domain: true, _count: { select: { experiments: true } } },
  });
  return shops.map((s) => ({ id: s.id, name: s.name, domain: s.domain, experiments: s._count.experiments }));
}
