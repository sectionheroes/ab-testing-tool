/**
 * Live aggregation for the results page (ADR-0019): counts and revenue come from one query over
 * Exposure ⨝ OrderAttribution ⨝ Order ⨝ Refund, never from DailyStat. lib/stats does the mathematics, this file does
 * the counting definitions of contract 4.8 and hands numbers over.
 *
 * Order → visitor mapping (ADR-0032): nothing ties an order to a visitorId – contract 4.1 carries only
 * `<experiment>:<variant>`. One conversion is therefore one *identity*: `Order.customerId` when the order has one,
 * otherwise the order itself. Repeat purchases of a logged-in customer count once, repeat guest purchases without a
 * customer id count more than once (a known, small upward bias on CR). Where an exposure can be linked to the order
 * through `Exposure.customerId` (set by the login link, 4.5), the order additionally inherits that visitor's device
 * and its exact `firstSeenAt` window bound; unlinked orders land in the `unknown` device bucket and use
 * `Experiment.startedAt` as the lower bound.
 */
import type { Experiment, Shop, Variant } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  STATS_VERSION,
  evaluate,
  rpvMomentsFromOrders,
  type ArmCounts,
  type Device,
  type EvaluateResult,
  type Metric,
  type Moments,
  type VariantStats,
} from "../../lib/stats";
import prisma from "../db.server";
import { logAudit } from "./audit.server";
import { localDayRangeUtc } from "./timezone";

/** Winsorization quantile for RPV and AOV – contract 4.8. Kept next to the SQL because the caps are built here. */
const WINSORIZE_Q = 0.99;
const DEVICES: Device[] = ["mobile", "desktop", "tablet"];
/** Orders we could not tie to an exposure keep their counts but have no device (ADR-0032). */
export const UNKNOWN_DEVICE = "unknown";

export type StatsRow = {
  kind: "exposure" | "order";
  variant_id: string;
  device: string | null;
  is_bot: boolean;
  n: number;
  identity: string | null;
  net: number;
};

export type ExperimentForStats = Experiment & { shop: Pick<Shop, "id" | "timezone">; variants: Variant[] };

/**
 * Every function here takes the Prisma client instead of reaching for the singleton, so the integration tests can run
 * inside `prisma.$transaction(tx => …)` and throw at the end: the fixtures are rolled back, never deleted.
 */
export type Db = Prisma.TransactionClient;

/**
 * Binds a timestamp for raw SQL against Prisma's `timestamp(3) without time zone` columns, which hold UTC.
 *
 * A plain `${date}` parameter is sent as `timestamptz`; comparing that against a `timestamp` column makes Postgres
 * reinterpret it in the session's TimeZone. On this machine that is Europe/Berlin and every bound silently moves by
 * one or two hours – on Render, where the session is UTC, it would not. Rendering the instant as a UTC literal and
 * casting it to `timestamp` removes the session from the equation.
 */
export function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString().replace("T", " ").replace("Z", "")}::timestamp`;
}

/** `Experiment.taintedDays` is Json; anything that is not a YYYY-MM-DD string is ignored rather than trusted. */
export function taintedDays(experiment: Pick<Experiment, "taintedDays">): string[] {
  const raw = experiment.taintedDays;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

/**
 * The single aggregation query. Returns two kinds of rows in one round trip:
 *  - `exposure`: one row per (variant, device, isBot) with its count – non-bot rows are the visitors of 4.8.
 *  - `order`:    one row per counting order with its net revenue, its identity and, where linkable, its device.
 *
 * Tainted days (ADR-0026) are evaluated in `Shop.timezone`, not UTC. Prisma stores DateTime as
 * `timestamp(3) without time zone` holding UTC, hence the `AT TIME ZONE 'UTC' AT TIME ZONE <tz>` pair. Both the
 * exposures of a tainted day and the orders of the customers exposed on it drop out, as do orders created on one.
 */
export async function rawStatsRows(
  experiment: ExperimentForStats,
  windowFrom: Date,
  windowTo: Date,
  db: Db = prisma,
): Promise<StatsRow[]> {
  const tz = experiment.shop.timezone ?? "UTC";
  const tainted = taintedDays(experiment);
  // Each tainted day becomes the UTC interval it covers in the shop's timezone (see timezone.ts). With no tainted
  // days nothing is added to the SQL at all.
  const ranges = tainted.map((day) => localDayRangeUtc(day, tz));
  const notOnTaintedDay = (column: Prisma.Sql) =>
    ranges.length === 0
      ? Prisma.empty
      : Prisma.join(
          ranges.map((r) => Prisma.sql`AND NOT (${column} >= ${utcTimestamp(r.from)} AND ${column} < ${utcTimestamp(r.to)})`),
          " ",
        );
  const exposureDayFilter = notOnTaintedDay(Prisma.sql`e."firstSeenAt"`);
  const orderDayFilter = notOnTaintedDay(Prisma.sql`o."createdAt"`);

  return db.$queryRaw<StatsRow[]>`
    WITH counting_orders AS (
      SELECT oa."variantId" AS variant_id,
             o.id AS order_id,
             o."customerId" AS customer_id,
             o."createdAt" AS created_at,
             (o."totalPrice" - COALESCE(r.refunded, 0))::float8 AS net
      FROM "OrderAttribution" oa
      JOIN "Order" o ON o.id = oa."orderId"
      LEFT JOIN LATERAL (
        SELECT SUM(rf.amount) AS refunded FROM "Refund" rf WHERE rf."orderId" = o.id
      ) r ON true
      WHERE oa."experimentId" = ${experiment.id}
        AND o."isTest" = false
        AND o."cancelledAt" IS NULL
        AND o."sourceName" NOT IN ('pos', 'shopify_draft_order')
        AND o."createdAt" >= ${utcTimestamp(windowFrom)}
        AND o."createdAt" <= ${utcTimestamp(windowTo)}
        ${orderDayFilter}
    ),
    linked AS (
      SELECT co.*,
             k.device AS linked_device,
             -- Every visitor behind this customer dropped out (bot or tainted day): the order goes with them.
             (
               co.customer_id IS NOT NULL
               AND k.device IS NULL
               AND EXISTS (SELECT 1 FROM "Exposure" d WHERE d."experimentId" = ${experiment.id} AND d."customerId" = co.customer_id)
             ) AS dropped
      FROM counting_orders co
      LEFT JOIN LATERAL (
        -- Straight at the table, not at a CTE: this is what lets Exposure_customerId_idx do the work. Through a
        -- materialised CTE the same join scans a million rows per order and takes minutes instead of milliseconds.
        SELECT e.device
        FROM "Exposure" e
        WHERE e."experimentId" = ${experiment.id}
          AND e."isBot" = false
          AND e."customerId" = co.customer_id
          AND e."variantId" = co.variant_id
          AND e."firstSeenAt" <= co.created_at
          ${exposureDayFilter}
        ORDER BY e."firstSeenAt" ASC
        LIMIT 1
      ) k ON true
    )
    SELECT 'exposure'::text AS kind, e."variantId" AS variant_id, e.device, e."isBot" AS is_bot,
           COUNT(*)::int AS n, NULL::text AS identity, 0::float8 AS net
    FROM "Exposure" e
    WHERE e."experimentId" = ${experiment.id}
      ${exposureDayFilter}
    GROUP BY e."variantId", e.device, e."isBot"
    UNION ALL
    SELECT 'order'::text AS kind, variant_id, linked_device AS device, false AS is_bot, 1 AS n,
           COALESCE(customer_id, 'order:' || order_id) AS identity, net
    FROM linked
    WHERE NOT dropped
  `;
}

type ArmAccumulator = {
  visitors: number;
  bots: number;
  byDeviceVisitors: Record<string, number>;
  /** identity → net revenue of all its counting orders. */
  identityRevenue: Map<string, number>;
  /** identity → the device of the linked exposure, or UNKNOWN_DEVICE. */
  identityDevice: Map<string, string>;
  orderNets: number[];
  orderDevices: string[];
};

const emptyArm = (): ArmAccumulator => ({
  visitors: 0,
  bots: 0,
  byDeviceVisitors: {},
  identityRevenue: new Map(),
  identityDevice: new Map(),
  orderNets: [],
  orderDevices: [],
});

/**
 * Type-7 percentile of a vector that is mostly zeros, without materialising the zeros: the sorted vector is
 * [negatives asc] ++ [zeros] ++ [positives asc]. `nonZeroSorted` must be sorted ascending.
 */
export function sparsePercentile(total: number, nonZeroSorted: number[], q: number): number {
  if (total <= 0) return NaN;
  const zeros = total - nonZeroSorted.length;
  if (zeros < 0) throw new Error("sparsePercentile: more values than slots");
  let negCount = 0;
  while (negCount < nonZeroSorted.length && nonZeroSorted[negCount] < 0) negCount++;
  const at = (idx: number) => {
    if (idx < negCount) return nonZeroSorted[idx];
    if (idx < negCount + zeros) return 0;
    return nonZeroSorted[idx - zeros];
  };
  if (total === 1) return at(0);
  const pos = q * (total - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = at(lo);
  return lo === hi ? a : a + (pos - lo) * (at(hi) - a);
}

/** Moments of `nonZero` values padded with (total − nonZero.length) zeros, each capped at `cap`. */
export function winsorizedMoments(total: number, nonZero: number[], cap: number): Moments {
  if (total <= 0) return { n: 0, mean: NaN, variance: NaN };
  const zeroValue = Math.min(0, cap);
  const zeros = total - nonZero.length;
  let sum = zeros * zeroValue;
  let sumSq = zeros * zeroValue * zeroValue;
  for (const v of nonZero) {
    const x = v > cap ? cap : v;
    sum += x;
    sumSq += x * x;
  }
  const mean = sum / total;
  const variance = total > 1 ? Math.max((sumSq - (sum * sum) / total) / (total - 1), 0) : 0;
  return { n: total, mean, variance };
}

/** Dense variant of the above, for per-order AOV values. */
function denseWinsorizedMoments(values: number[], cap: number): Moments {
  if (values.length === 0) return { n: 0, mean: NaN, variance: NaN };
  let sum = 0;
  let sumSq = 0;
  for (const v of values) {
    const x = v > cap ? cap : v;
    sum += x;
    sumSq += x * x;
  }
  const n = values.length;
  const mean = sum / n;
  const variance = n > 1 ? Math.max((sumSq - (sum * sum) / n) / (n - 1), 0) : 0;
  return { n, mean, variance };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Folds the raw rows into the per-variant shape lib/stats expects, including the pooled winsorization caps. */
export function buildVariantStats(variants: Variant[], rows: StatsRow[]): VariantStats[] {
  const arms = new Map<string, ArmAccumulator>();
  for (const v of variants) arms.set(v.id, emptyArm());

  for (const row of rows) {
    const arm = arms.get(row.variant_id);
    if (!arm) continue; // a variant that no longer exists – ignore rather than invent an arm
    if (row.kind === "exposure") {
      if (row.is_bot) {
        arm.bots += row.n;
      } else {
        arm.visitors += row.n;
        const device = row.device ?? UNKNOWN_DEVICE;
        arm.byDeviceVisitors[device] = (arm.byDeviceVisitors[device] ?? 0) + row.n;
      }
      continue;
    }
    const identity = row.identity ?? `order:${row.variant_id}:${arm.orderNets.length}`;
    const device = row.device ?? UNKNOWN_DEVICE;
    arm.identityRevenue.set(identity, (arm.identityRevenue.get(identity) ?? 0) + row.net);
    // First linked device wins; an identity that ordered from two devices keeps the one we saw first.
    if (!arm.identityDevice.has(identity) || arm.identityDevice.get(identity) === UNKNOWN_DEVICE) {
      arm.identityDevice.set(identity, device);
    }
    arm.orderNets.push(row.net);
    arm.orderDevices.push(device);
  }

  // Winsorization caps are computed over BOTH arms together (contract 4.8), so they are built before the arms are
  // turned into ArmCounts.
  const totalVisitors = [...arms.values()].reduce((s, a) => s + Math.max(a.visitors, a.identityRevenue.size), 0);
  const allIdentityRevenue = [...arms.values()].flatMap((a) => [...a.identityRevenue.values()]).filter((v) => v !== 0);
  allIdentityRevenue.sort((x, y) => x - y);
  const rpvCap = sparsePercentile(totalVisitors, allIdentityRevenue, WINSORIZE_Q);

  const allOrderNets = [...arms.values()].flatMap((a) => a.orderNets).sort((x, y) => x - y);
  const aovCap = allOrderNets.length > 0 ? sparsePercentile(allOrderNets.length, allOrderNets, WINSORIZE_Q) : NaN;

  return variants.map((v) => {
    const arm = arms.get(v.id)!;
    const revenues = [...arm.identityRevenue.values()];
    const total = revenues.reduce((s, r) => s + r, 0);

    const byDevice: Partial<Record<Device, ArmCounts>> = {};
    const deviceBuckets = new Map<string, { converters: number; orders: number; revenue: number }>();
    for (const [identity, revenue] of arm.identityRevenue) {
      const device = arm.identityDevice.get(identity) ?? UNKNOWN_DEVICE;
      const bucket = deviceBuckets.get(device) ?? { converters: 0, orders: 0, revenue: 0 };
      bucket.converters++;
      bucket.revenue += revenue;
      deviceBuckets.set(device, bucket);
    }
    for (const device of arm.orderDevices) {
      const bucket = deviceBuckets.get(device) ?? { converters: 0, orders: 0, revenue: 0 };
      bucket.orders++;
      deviceBuckets.set(device, bucket);
    }
    for (const device of DEVICES) {
      const bucket = deviceBuckets.get(device) ?? { converters: 0, orders: 0, revenue: 0 };
      byDevice[device] = {
        visitors: arm.byDeviceVisitors[device] ?? 0,
        converters: bucket.converters,
        orders: bucket.orders,
        revenue: round2(bucket.revenue),
      };
    }

    const visitors = arm.visitors;
    const nonZero = revenues.filter((r) => r !== 0).sort((x, y) => x - y);
    return {
      key: v.key,
      name: v.name,
      isControl: v.isControl,
      weight: v.weight,
      visitors,
      converters: arm.identityRevenue.size,
      orders: arm.orderNets.length,
      revenue: round2(total),
      botVisitors: arm.bots,
      rpvMoments: winsorizedMoments(Math.max(visitors, arm.identityRevenue.size), nonZero, rpvCap),
      aovMoments: arm.orderNets.length > 0 ? denseWinsorizedMoments(arm.orderNets, aovCap) : undefined,
      byDevice,
    } satisfies VariantStats;
  });
}

export function loadExperimentForStats(experimentId: string, db: Db = prisma) {
  return db.experiment.findUnique({
    where: { id: experimentId },
    include: { shop: { select: { id: true, timezone: true } }, variants: { orderBy: { key: "asc" } } },
  });
}

export type ExperimentStats = EvaluateResult & {
  experimentId: string;
  /** Share of counting orders we could tie to an exposure – the per-device order numbers rest on exactly these. */
  deviceLinkRate: number;
  /** Orders that carry no device because no exposure could be linked (ADR-0032). */
  ordersWithoutDevice: number;
};

/**
 * Live numbers for one experiment. `now` closes the attribution window for a running experiment; an ended one is
 * closed by `endedAt` (4.8). Results of an ENDED experiment are read from the frozen snapshot in WP5, not from here –
 * this stays the source for RUNNING/PAUSED and for freezing the snapshot once.
 */
export async function computeExperimentStats(experimentId: string, opts: { now?: Date; db?: Db } = {}): Promise<ExperimentStats> {
  const db = opts.db ?? prisma;
  const experiment = await loadExperimentForStats(experimentId, db);
  if (!experiment) throw new Error(`computeExperimentStats: experiment ${experimentId} not found`);
  return computeStatsFor(experiment, opts);
}

export async function computeStatsFor(experiment: ExperimentForStats, opts: { now?: Date; db?: Db } = {}): Promise<ExperimentStats> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const windowFrom = experiment.startedAt ?? new Date(0);
  const windowTo = experiment.endedAt ?? now;

  const rows = await rawStatsRows(experiment, windowFrom, windowTo, db);
  const variantStats = buildVariantStats(experiment.variants, rows);

  const orderRows = rows.filter((r) => r.kind === "order");
  const withDevice = orderRows.filter((r) => r.device !== null).length;

  const result = evaluate(
    {
      primaryMetric: experiment.primaryMetric as Metric,
      plannedSampleSize: experiment.plannedSampleSize,
      window: { from: experiment.startedAt, to: windowTo },
      taintedDays: taintedDays(experiment),
    },
    variantStats,
    STATS_VERSION,
  );

  return {
    ...result,
    experimentId: experiment.id,
    deviceLinkRate: orderRows.length > 0 ? withDevice / orderRows.length : 0,
    ordersWithoutDevice: orderRows.length - withDevice,
  };
}

/**
 * Marks or unmarks a day as tainted (ADR-0026, rahmen 7.2). The UI is WP5; the rule lives here so the CLI and the
 * dashboard share it. Every change is an AuditLog entry – the discipline the ADR asks for only works if it is visible.
 */
export async function setTaintedDay(
  experimentId: string,
  day: string,
  tainted: boolean,
  actor: string,
  db: Db = prisma,
): Promise<{ taintedDays: string[]; changed: boolean }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`setTaintedDay: expected YYYY-MM-DD, got ${day}`);
  const experiment = await db.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new Error(`setTaintedDay: experiment ${experimentId} not found`);

  const current = taintedDays(experiment);
  const next = tainted ? [...new Set([...current, day])].sort() : current.filter((d) => d !== day);
  if (next.length === current.length && next.every((d, i) => d === current[i])) {
    return { taintedDays: current, changed: false };
  }

  await db.experiment.update({ where: { id: experimentId }, data: { taintedDays: next } });
  await logAudit(
    {
      shopId: experiment.shopId,
      experimentId,
      actor,
      action: "UPDATED",
      diff: { taintedDays: { from: current, to: next, day, tainted } },
    },
    db,
  );
  return { taintedDays: next, changed: true };
}

/**
 * Planning inputs for `sampleSize({ metric: "RPV" | "AOV", … })`: σ of revenue per visitor from the shop's own recent
 * orders (plan WP4). Lives in the server layer because it needs the database; the pure approximation is
 * `rpvMomentsFromOrders` in lib/stats.
 *
 * `visitors` is what the caller expects per day over the same window – if it is omitted the CR cannot be derived and
 * only AOV numbers come back.
 */
export async function rpvPlanningInputs(
  shopId: string,
  opts: { days?: number; visitors?: number; now?: Date; db?: Db } = {},
): Promise<{ orders: number; aov: number; aovSd: number; cr: number | null; mean: number | null; sd: number | null }> {
  const db = opts.db ?? prisma;
  const days = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await db.order.findMany({
    where: {
      shopId,
      createdAt: { gte: from, lte: now },
      isTest: false,
      cancelledAt: null,
      sourceName: { notIn: ["pos", "shopify_draft_order"] },
    },
    select: { totalPrice: true },
  });
  const amounts = rows.map((r) => Number(r.totalPrice));
  if (amounts.length === 0) return { orders: 0, aov: NaN, aovSd: NaN, cr: null, mean: null, sd: null };

  const aov = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const aovVariance = amounts.length > 1 ? amounts.reduce((s, a) => s + (a - aov) ** 2, 0) / (amounts.length - 1) : 0;
  const cr = opts.visitors && opts.visitors > 0 ? amounts.length / opts.visitors : null;
  const rpv = cr !== null ? rpvMomentsFromOrders(cr, amounts) : null;
  return { orders: amounts.length, aov, aovSd: Math.sqrt(aovVariance), cr, mean: rpv?.mean ?? null, sd: rpv?.sd ?? null };
}
