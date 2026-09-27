/**
 * Live aggregation for the results page (ADR-0019): counts and revenue come from one query over
 * Exposure ⨝ OrderAttribution ⨝ Order ⨝ Refund, never from DailyStat. lib/stats does the mathematics, this file does
 * the counting definitions of contract 4.8 and hands numbers over.
 *
 * Order → visitor mapping, two paths (ADR-0033, which supersedes ADR-0032):
 *
 *  1. **The `_ab_v` path.** The snippet carries the visitorId in its own cart attribute (contract 4.1b) and the ingest
 *     writes it to `OrderAttribution.visitorId`. Where it is there, the order is joined straight onto the visitor's
 *     `Exposure`: converters are `COUNT(DISTINCT visitorId)`, revenue per visitor is per real visitor, the window's
 *     lower bound is that visitor's real `firstSeenAt`, and the device is `Exposure.device`. This is the first time
 *     4.8's "a visitor with three orders converts once" is literally true, for guests as well as for logged-in
 *     customers.
 *  2. **The ADR-0032 fallback**, for orders without `_ab_v` (no cart contact, the CUSTOMER_LOOKUP path, or an older
 *     order). A conversion is then an *identity*: `Order.customerId` when the order has one, otherwise the order
 *     itself. Repeat guest purchases count more than once – the known, small upward bias that path was accepted with.
 *     Such an order gets a device only if `Exposure.customerId` links it (login link, 4.5), and otherwise lands in the
 *     `unknown` bucket.
 *
 * `unknown` is the fourth, visible device bucket (4.10): the device rows sum to the totals, and a rising `unknown`
 * share is a data-quality signal the results page has to show rather than hide.
 */
import type { Experiment, Shop, Variant } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  DEVICE_BUCKETS,
  STATS_VERSION,
  UNKNOWN_DEVICE,
  classifyChannel,
  dayRange,
  evaluate,
  localDayRangeUtc,
  localDayString,
  rpvMomentsFromOrders,
  type ArmCounts,
  type DeviceBucket,
  type EvaluateResult,
  type Metric,
  type Moments,
  type StoppingRuleConfig,
  type VariantStats,
} from "../../lib/stats";
import prisma from "../db.server";
import { logAudit } from "./audit.server";

/** Winsorization quantile for RPV and AOV – contract 4.8. Kept next to the SQL because the caps are built here. */
const WINSORIZE_Q = 0.99;
export { UNKNOWN_DEVICE };

export type StatsRow = {
  kind: "exposure" | "order";
  variant_id: string;
  device: string | null;
  is_bot: boolean;
  n: number;
  identity: string | null;
  net: number;
};

export type ExperimentForStats = Experiment & { shop: Pick<Shop, "id" | "domain" | "timezone">; variants: Variant[] };

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

/** The three stopping-rule fields of ADR-0036, read off the experiment row. */
export function stoppingRuleOf(
  experiment: Pick<Experiment, "minConversionsPerArm" | "minDurationDays" | "requireFullWeeks">,
): StoppingRuleConfig {
  return {
    minConversionsPerArm: experiment.minConversionsPerArm,
    minDurationDays: experiment.minDurationDays,
    requireFullWeeks: experiment.requireFullWeeks,
  };
}

/**
 * The single aggregation query. Returns two kinds of rows in one round trip:
 *  - `exposure`: one row per (variant, device, isBot) with its count – non-bot rows are the visitors of 4.8.
 *  - `order`:    one row per counting order with its net revenue, its identity and, where linkable, its device.
 *
 * Tainted days (ADR-0026) are evaluated in `Shop.timezone`, not UTC. Prisma stores DateTime as
 * `timestamp(3) without time zone` holding UTC, hence the UTC intervals built by `localDayRangeUtc` and bound through
 * `utcTimestamp()`. Both the exposures of a tainted day and the orders of the visitors exposed on it drop out, as do
 * orders created on one.
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
             oa."visitorId" AS visitor_id,
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
             -- The _ab_v path (4.1b) first, the ADR-0032 customer link second. Both are separate laterals rather
             -- than one with a CASE, so each keeps its own index: Exposure_experimentId_visitorId_key for the first,
             -- Exposure_customerId_idx for the second. With a NULL key the index probe finds nothing and costs nothing.
             COALESCE(kv.device, kc.device) AS linked_device,
             -- Every exposure this order could belong to dropped out (bot, tainted day, wrong variant, after the
             -- order): the order goes with them. 4.8 – "orders with an attribute but no matching exposure do not
             -- count". Checked only when the order names someone; an order that names nobody cannot be checked, and an
             -- id we have never seen an exposure for is a lost beacon, not a mismatch, so it stays in.
             (
               kv."visitorId" IS NULL
               AND co.visitor_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM "Exposure" d WHERE d."experimentId" = ${experiment.id} AND d."visitorId" = co.visitor_id)
             ) AS visitor_dropped,
             (
               kv."visitorId" IS NULL
               AND co.visitor_id IS NULL
               AND co.customer_id IS NOT NULL
               AND kc.device IS NULL
               AND EXISTS (SELECT 1 FROM "Exposure" d WHERE d."experimentId" = ${experiment.id} AND d."customerId" = co.customer_id)
             ) AS customer_dropped
      FROM counting_orders co
      LEFT JOIN LATERAL (
        -- Straight at the table, not at a CTE: this is what lets the indexes do the work. Through a materialised CTE
        -- the same join scans a million rows per order and takes minutes instead of milliseconds.
        SELECT e."visitorId", e.device
        FROM "Exposure" e
        WHERE e."experimentId" = ${experiment.id}
          AND e."visitorId" = co.visitor_id
          AND e."isBot" = false
          AND e."variantId" = co.variant_id
          AND e."firstSeenAt" <= co.created_at
          ${exposureDayFilter}
        LIMIT 1
      ) kv ON true
      LEFT JOIN LATERAL (
        SELECT e.device
        FROM "Exposure" e
        -- Only for orders without an _ab_v: with one, kv above already answered, and on a shop where most orders carry
        -- it this lateral would otherwise be 30 000 index descents that find nothing (measured: ~60 ms of the budget).
        WHERE co.visitor_id IS NULL
          AND e."experimentId" = ${experiment.id}
          AND e."customerId" = co.customer_id
          AND e."isBot" = false
          AND e."variantId" = co.variant_id
          AND e."firstSeenAt" <= co.created_at
          ${exposureDayFilter}
        ORDER BY e."firstSeenAt" ASC
        LIMIT 1
      ) kc ON true
    )
    SELECT 'exposure'::text AS kind, e."variantId" AS variant_id, e.device, e."isBot" AS is_bot,
           COUNT(*)::int AS n, NULL::text AS identity, 0::float8 AS net
    FROM "Exposure" e
    WHERE e."experimentId" = ${experiment.id}
      ${exposureDayFilter}
    GROUP BY e."variantId", e.device, e."isBot"
    UNION ALL
    -- Identity, in the order of ADR-0033: the visitor id whenever the order carries one (then a repeat purchase of the
    -- same guest is one conversion), else the customer, else the order itself.
    SELECT 'order'::text AS kind, variant_id, linked_device AS device, false AS is_bot, 1 AS n,
           COALESCE(visitor_id, customer_id, 'order:' || order_id) AS identity, net
    FROM linked
    WHERE NOT visitor_dropped AND NOT customer_dropped
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

    const byDevice: Partial<Record<DeviceBucket, ArmCounts>> = {};
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
    // All four buckets, `unknown` included (4.10) – it is what makes the device rows sum to the totals.
    for (const device of DEVICE_BUCKETS) {
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
    include: { shop: { select: { id: true, domain: true, timezone: true } }, variants: { orderBy: { key: "asc" } } },
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
      stoppingRule: stoppingRuleOf(experiment),
      startedAt: experiment.startedAt,
      timezone: experiment.shop.timezone ?? "UTC",
      now,
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

// ---------------------------------------------------------------------------------------------------------------
// breakdown() – one query for every dimension of contracts 4.9 and 4.10
// ---------------------------------------------------------------------------------------------------------------

/**
 * `day` is the time series of contract 4.9; `device`, `visitorType` and `channel` are the segment dimensions of 4.10.
 * `opts.byDay` adds the day dimension on top of a segment one, which is what the daily-performance charts of the
 * segment tabs need.
 */
export type BreakdownDimension = "day" | "device" | "visitorType" | "channel";

export type BreakdownRow = {
  variantKey: string;
  /**
   * Local calendar day of the **exposure** in `Shop.timezone` (4.9: a visitor counts on the day he was first exposed,
   * and his conversions and revenue count on that same day, whenever he actually bought). Only set when the day
   * dimension is active. `null` for an order we could not tie to an exposure – there is no exposure day for it, and
   * putting it in a null row rather than inventing one is what keeps the series summing to the totals.
   */
  day: string | null;
  /**
   * The segment value. `"all"` for `dimension: "day"`, which has no segment. `"unknown"` wherever the segment could
   * not be determined: an order without `_ab_v` (device, channel) or an exposure from a snippet that sent no `n`
   * (visitorType, 4.10).
   */
  segment: string;
  visitors: number;
  converters: number;
  orders: number;
  revenue: number;
};

export type BreakdownResult = {
  experimentId: string;
  dimension: BreakdownDimension;
  byDay: boolean;
  rows: BreakdownRow[];
  /** Days excluded per ADR-0026. They are drawn as a gap, never as a zero and never interpolated (4.9). */
  taintedDays: string[];
  /** Every day of the window in `Shop.timezone`, tainted ones removed – the x-axis, so a day with no data is visible. */
  days: string[];
};

/** `"all"` is the single segment of the pure day dimension – it has no segment of its own. */
export const ALL_SEGMENTS = "all";
/** Segment value for a row whose segment could not be determined (4.10). */
export const UNKNOWN_SEGMENT = "unknown";

type BreakdownSqlRow = {
  variant_id: string;
  day: string | null;
  segment: string | null;
  /**
   * Whether this row has an exposure behind it: true for every exposure row, and for an order row exactly when it
   * could be tied to one. It has to come from the SQL rather than be inferred from the segment columns being null – a
   * linked order whose visitor arrived with no referrer and no UTM is `direct`, not `unknown`, and the two look
   * identical from here otherwise.
   */
  linked: boolean;
  /**
   * Referrer host and the raw utm object, only projected for the channel dimension. The host is reduced in SQL because
   * `document.referrer` is a full URL and a million of those are a million distinct group keys; the utm travels whole,
   * because grouping by the jsonb column costs one hash per row while `utm->>'source'`, `utm->>'medium'` and a
   * `utm <> '{}'` comparison cost three jsonb traversals (measured: 294 ms → 758 ms at a million rows). Handing
   * `classifyChannel` the whole object is also closer to what contract 4.10 describes than two extracted fields.
   */
  referrer: string | null;
  utm: Record<string, string> | null;
  visitors: number;
  identity: string | null;
  orders: number;
  net: number;
};

/**
 * The day dimension as a join against a **small list of UTC intervals**, one per local calendar day, instead of a
 * per-row date conversion. This is trap 2 of plan WP4.1 taken literally, and the measurement is why:
 *
 *   `GROUP BY (firstSeenAt AT TIME ZONE 'UTC' AT TIME ZONE tz)::date` stays index-only, but the computed key cannot be
 *   read in index order, so Postgres sorts a million rows to group them and spills 4 MB per worker to disk.
 *   Joining against 30 day intervals turns it into 30 narrow index range scans with the day as a constant – no sort,
 *   no spill, and the tainted days of ADR-0026 simply are not in the list.
 *
 * Every bound goes through `utcTimestamp()`, so the session timezone never enters into it (the rule in CLAUDE.md).
 */
function dayIntervals(days: string[], tz: string): Prisma.Sql {
  const rows = days.map((day) => {
    const { from, to } = localDayRangeUtc(day, tz);
    return Prisma.sql`(${day}::date, ${utcTimestamp(from)}, ${utcTimestamp(to)})`;
  });
  return Prisma.sql`(VALUES ${Prisma.join(rows, ", ")}) AS d(day, lo, hi)`;
}

/** The order side dates far fewer rows (one per counting order), so there the plain conversion is the cheap way. */
const dayExpr = (column: Prisma.Sql, tz: string) => Prisma.sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date`;

/** Host of a referrer, cheaply, so the classification groups by host instead of by a million distinct full URLs. */
const referrerHostExpr = (column: Prisma.Sql) =>
  Prisma.sql`NULLIF(split_part(split_part(COALESCE(split_part(${column}, '//', 2), ''), '/', 1), ':', 1), '')`;

/** The segment expression per dimension, or null where the segment is derived in TypeScript (channel). */
function segmentExpr(dimension: BreakdownDimension): Prisma.Sql {
  switch (dimension) {
    case "device":
      return Prisma.sql`e.device`;
    case "visitorType":
      // 4.10: new | returning | unknown. null means the snippet did not send `n` (ADR-0035).
      return Prisma.sql`CASE WHEN e."isNewVisitor" IS NULL THEN NULL WHEN e."isNewVisitor" THEN 'new' ELSE 'returning' END`;
    case "channel":
    case "day":
      return Prisma.sql`NULL::text`;
  }
}

/**
 * Breakdown of one experiment along one dimension (contracts 4.9 and 4.10), from the same live data as the headline
 * numbers – never from `DailyStat`, which has no `converters` column and would give an Orders ÷ Visitors rate that
 * contradicts 4.8.
 *
 * The three WP4 traps apply here unchanged and are the reason the SQL looks the way it does:
 *  1. The per-order exposure lookup goes straight at `"Exposure"`, never at a materialised CTE.
 *  2. Every day and every window bound is a UTC interval bound through `utcTimestamp()`, never a formatted string.
 *  3. The index-only scans need a vacuumed table – after a bulk load, `VACUUM` before measuring.
 *
 * Raw numbers, rates and improvement only: no p-value, no CI, no winner, no significance (ADR-0034). That is the
 * caller's contract as much as this one's – `breakdown()` deliberately returns counts, not verdicts.
 */
export async function breakdown(
  experiment: ExperimentForStats,
  dimension: BreakdownDimension,
  opts: { byDay?: boolean; now?: Date; db?: Db } = {},
): Promise<BreakdownResult> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const tz = experiment.shop.timezone ?? "UTC";
  const byDay = dimension === "day" || opts.byDay === true;
  const tainted = taintedDays(experiment);
  const taintedSet = new Set(tainted);

  const windowFrom = experiment.startedAt ?? new Date(0);
  const windowTo = experiment.endedAt ?? now;

  // The day list has to cover every exposure the experiment has, not just startedAt..endedAt: an exposure outside that
  // span (a stale snippet after the end, a clock skew) would otherwise fall through the interval join and the rows
  // would stop summing to evaluate(). One indexed min/max is cheap insurance for the property the whole table rests on.
  const span = await db.exposure.aggregate({
    where: { experimentId: experiment.id },
    _min: { firstSeenAt: true },
    _max: { firstSeenAt: true },
  });
  const firstSeen = span._min.firstSeenAt ?? experiment.startedAt ?? windowTo;
  const lastSeen = span._max.firstSeenAt ?? windowTo;
  const axisFrom = firstSeen < (experiment.startedAt ?? firstSeen) ? firstSeen : (experiment.startedAt ?? firstSeen);
  const axisTo = lastSeen > windowTo ? lastSeen : windowTo;
  const allDays = dayRange(localDayString(axisFrom, tz), localDayString(axisTo, tz));
  const days = allDays.filter((d) => !taintedSet.has(d));

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

  const segment = segmentExpr(dimension);
  const needsReferrer = dimension === "channel";
  // The exposure source: the day intervals joined onto "Exposure", so the day is a constant per scan rather than a
  // computed sort key, and the tainted days are excluded by not being in the list at all (see dayIntervals). Without
  // the day dimension a single interval spanning the whole axis does the same job in one range scan.
  const exposureFrom =
    byDay && days.length > 0
      ? Prisma.sql`${dayIntervals(days, tz)} JOIN "Exposure" e ON e."experimentId" = ${experiment.id} AND e."isBot" = false
        AND e."firstSeenAt" >= d.lo AND e."firstSeenAt" < d.hi`
      : Prisma.sql`"Exposure" e`;
  const exposureWhere =
    byDay && days.length > 0
      ? Prisma.empty
      : Prisma.sql`WHERE e."experimentId" = ${experiment.id} AND e."isBot" = false ${exposureDayFilter}`;
  const exposureDay = byDay ? Prisma.sql`d.day` : Prisma.sql`NULL::date`;
  // For the order side the day still comes from the visitor's exposure, not from the order (4.9, cohort dating).
  const linkedDay = byDay ? dayExpr(Prisma.sql`k."firstSeenAt"`, tz) : Prisma.sql`NULL::date`;
  const linkedSegment =
    dimension === "device"
      ? Prisma.sql`k.device`
      : dimension === "visitorType"
        ? Prisma.sql`CASE WHEN k."isNewVisitor" IS NULL THEN NULL WHEN k."isNewVisitor" THEN 'new' ELSE 'returning' END`
        : Prisma.sql`NULL::text`;
  const exposureReferrer = needsReferrer ? referrerHostExpr(Prisma.sql`e.referrer`) : Prisma.sql`NULL::text`;
  const exposureUtm = needsReferrer ? Prisma.sql`e.utm` : Prisma.sql`NULL::jsonb`;
  const linkedReferrer = needsReferrer ? referrerHostExpr(Prisma.sql`k.referrer`) : Prisma.sql`NULL::text`;
  const linkedUtm = needsReferrer ? Prisma.sql`k.utm` : Prisma.sql`NULL::jsonb`;

  const rows = await db.$queryRaw<BreakdownSqlRow[]>`
    WITH counting_orders AS (
      SELECT oa."variantId" AS variant_id,
             o.id AS order_id,
             oa."visitorId" AS visitor_id,
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
      SELECT co.*, (k."firstSeenAt" IS NOT NULL) AS linked, ${linkedDay} AS day, ${linkedSegment} AS segment,
             ${linkedReferrer} AS referrer, ${linkedUtm} AS utm,
             (
               kv."visitorId" IS NULL
               AND co.visitor_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM "Exposure" d WHERE d."experimentId" = ${experiment.id} AND d."visitorId" = co.visitor_id)
             ) AS visitor_dropped,
             (
               kv."visitorId" IS NULL
               AND co.visitor_id IS NULL
               AND co.customer_id IS NOT NULL
               AND kc.id IS NULL
               AND EXISTS (SELECT 1 FROM "Exposure" d WHERE d."experimentId" = ${experiment.id} AND d."customerId" = co.customer_id)
             ) AS customer_dropped
      FROM counting_orders co
      -- Trap 1: both lookups go straight at "Exposure" so the (experimentId, visitorId) unique index and
      -- Exposure_customerId_idx are used. A materialised CTE here turns each into a full scan.
      LEFT JOIN LATERAL (
        SELECT e.id, e."visitorId", e.device, e."isNewVisitor", e."firstSeenAt", e.referrer, e.utm
        FROM "Exposure" e
        WHERE e."experimentId" = ${experiment.id}
          AND e."visitorId" = co.visitor_id
          AND e."isBot" = false
          AND e."variantId" = co.variant_id
          AND e."firstSeenAt" <= co.created_at
          ${exposureDayFilter}
        LIMIT 1
      ) kv ON true
      LEFT JOIN LATERAL (
        SELECT e.id, e.device, e."isNewVisitor", e."firstSeenAt", e.referrer, e.utm
        FROM "Exposure" e
        WHERE co.visitor_id IS NULL
          AND e."experimentId" = ${experiment.id}
          AND e."customerId" = co.customer_id
          AND e."isBot" = false
          AND e."variantId" = co.variant_id
          AND e."firstSeenAt" <= co.created_at
          ${exposureDayFilter}
        ORDER BY e."firstSeenAt" ASC
        LIMIT 1
      ) kc ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(kv.device, kc.device) AS device,
               COALESCE(kv."isNewVisitor", kc."isNewVisitor") AS "isNewVisitor",
               COALESCE(kv."firstSeenAt", kc."firstSeenAt") AS "firstSeenAt",
               COALESCE(kv.referrer, kc.referrer) AS referrer,
               COALESCE(kv.utm, kc.utm) AS utm
      ) k ON true
    )
    SELECT e."variantId" AS variant_id, ${exposureDay} AS day, ${segment} AS segment,
           ${exposureReferrer} AS referrer, ${exposureUtm} AS utm, true AS linked,
           COUNT(*)::int AS visitors, NULL::text AS identity, 0 AS orders, 0::float8 AS net
    FROM ${exposureFrom}
    ${exposureWhere}
    GROUP BY 1, 2, 3, 4, 5
    UNION ALL
    SELECT variant_id, day, segment, referrer, utm, linked,
           0 AS visitors,
           COALESCE(visitor_id, customer_id, 'order:' || order_id) AS identity,
           1 AS orders, net
    FROM linked
    WHERE NOT visitor_dropped AND NOT customer_dropped
  `;

  return {
    experimentId: experiment.id,
    dimension,
    byDay,
    rows: foldBreakdownRows(experiment, dimension, byDay, rows),
    taintedDays: tainted,
    days: byDay ? days : [],
  };
}

/**
 * Folds the SQL rows into `BreakdownRow`s: applies `classifyChannel()` where the dimension is channel (it is code, not
 * a stored value, 4.10), deduplicates converting visitors per (day, segment) and rounds the money.
 *
 * Grouping the channel inputs in SQL and classifying the groups here is what keeps it affordable: the distinct
 * (host, source, medium) combinations of a shop are a handful, the exposures are a million.
 */
function foldBreakdownRows(
  experiment: ExperimentForStats,
  dimension: BreakdownDimension,
  byDay: boolean,
  rows: BreakdownSqlRow[],
): BreakdownRow[] {
  const variantKey = new Map(experiment.variants.map((v) => [v.id, v.key]));
  const selfHosts = [experiment.shop.domain].filter((d): d is string => typeof d === "string" && d.length > 0);

  type Bucket = { visitors: number; identities: Set<string>; orders: number; revenue: number };
  const buckets = new Map<string, { variantKey: string; day: string | null; segment: string; bucket: Bucket }>();

  for (const row of rows) {
    const key = variantKey.get(row.variant_id);
    if (key === undefined) continue; // a variant that no longer exists – ignore rather than invent an arm
    const day = byDay ? normaliseDay(row.day) : null;
    const segment =
      dimension === "day"
        ? ALL_SEGMENTS
        : dimension === "channel"
          ? // An order we could not tie to an exposure has no channel to derive; `unknown` keeps the sum right and is
            // distinct from `unassigned`, which means "a UTM was there but no rule matched".
            row.linked
            ? classifyChannel(row.referrer, row.utm, { selfHosts })
            : UNKNOWN_SEGMENT
          : (row.segment ?? UNKNOWN_SEGMENT);

    const id = `${key}\u0000${day ?? ""}\u0000${segment}`;
    let entry = buckets.get(id);
    if (!entry) {
      entry = { variantKey: key, day, segment, bucket: { visitors: 0, identities: new Set(), orders: 0, revenue: 0 } };
      buckets.set(id, entry);
    }
    entry.bucket.visitors += row.visitors;
    entry.bucket.orders += row.orders;
    entry.bucket.revenue += row.net;
    // 4.8 / ADR-0033: a visitor with three orders converts once, inside the segment as well as overall.
    if (row.identity !== null) entry.bucket.identities.add(row.identity);
  }

  return [...buckets.values()]
    .map((e) => ({
      variantKey: e.variantKey,
      day: e.day,
      segment: e.segment,
      visitors: e.bucket.visitors,
      converters: e.bucket.identities.size,
      orders: e.bucket.orders,
      revenue: round2(e.bucket.revenue),
    }))
    .sort(
      (a, b) =>
        (a.day ?? "￿").localeCompare(b.day ?? "￿") || a.segment.localeCompare(b.segment) || a.variantKey.localeCompare(b.variantKey),
    );
}

/** Postgres hands a `date` back as a Date (midnight UTC) or a string, depending on the driver path. */
function normaliseDay(day: string | Date | null): string | null {
  if (day === null) return null;
  return day instanceof Date ? day.toISOString().slice(0, 10) : String(day).slice(0, 10);
}

/** Convenience wrapper for callers that only have an id. */
export async function computeBreakdown(
  experimentId: string,
  dimension: BreakdownDimension,
  opts: { byDay?: boolean; now?: Date; db?: Db } = {},
): Promise<BreakdownResult> {
  const db = opts.db ?? prisma;
  const experiment = await loadExperimentForStats(experimentId, db);
  if (!experiment) throw new Error(`computeBreakdown: experiment ${experimentId} not found`);
  return breakdown(experiment, dimension, opts);
}
