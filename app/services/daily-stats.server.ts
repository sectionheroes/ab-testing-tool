/**
 * DailyStat materialisation (plan WP4, ADR-0019). History and charts only – NEVER the source of the results page,
 * which always queries live (stats.server.ts). Day boundaries are in `Shop.timezone`, not UTC, so the numbers line
 * up with Shopify Analytics (contract 4.8).
 *
 * Idempotent per (experiment, variant, day): the job upserts, so re-running it for a day it already wrote produces
 * the same rows. No cron yet – that is WP6.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { taintedDays, utcTimestamp, type Db } from "./stats.server";

export type DailyStatsResult = {
  experiments: number;
  days: number;
  rows: number;
  skipped: { experimentId: string; reason: string }[];
};

type DayRow = {
  variant_id: string;
  day: string;
  visitors: number;
  orders: number;
  revenue_gross: number;
  revenue_net: number;
};

/**
 * One query per experiment, same filters as the live aggregation (4.8): non-bot exposures, orders that are not
 * pos/draft, not test, not cancelled. Orders are dated by their own local day – an order is revenue of the day it
 * was placed, which is how a merchant reads a chart.
 *
 * Tainted days are NOT skipped here: DailyStat is the history, and a day that was excluded from a verdict still
 * happened. `Experiment.taintedDays` stays the single place that says which days the evaluation ignored.
 */
async function dailyRowsFor(
  experiment: { id: string; startedAt: Date | null; endedAt: Date | null },
  tz: string,
  from: Date,
  to: Date,
  db: Db,
): Promise<DayRow[]> {
  return db.$queryRaw<DayRow[]>`
    WITH visitors AS (
      SELECT e."variantId" AS variant_id,
             to_char((e."firstSeenAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS visitors
      FROM "Exposure" e
      WHERE e."experimentId" = ${experiment.id} AND e."isBot" = false
        AND e."firstSeenAt" >= ${utcTimestamp(from)} AND e."firstSeenAt" < ${utcTimestamp(to)}
      GROUP BY 1, 2
    ),
    orders AS (
      SELECT oa."variantId" AS variant_id,
             to_char((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS orders,
             SUM(o."totalPrice")::float8 AS revenue_gross,
             SUM(o."totalPrice" - COALESCE(r.refunded, 0))::float8 AS revenue_net
      FROM "OrderAttribution" oa
      JOIN "Order" o ON o.id = oa."orderId"
      LEFT JOIN LATERAL (
        SELECT SUM(rf.amount) AS refunded FROM "Refund" rf WHERE rf."orderId" = o.id
      ) r ON true
      WHERE oa."experimentId" = ${experiment.id}
        AND o."isTest" = false
        AND o."cancelledAt" IS NULL
        AND o."sourceName" NOT IN ('pos', 'shopify_draft_order')
        AND o."createdAt" >= ${utcTimestamp(from)} AND o."createdAt" < ${utcTimestamp(to)}
      GROUP BY 1, 2
    )
    SELECT COALESCE(v.variant_id, o.variant_id) AS variant_id,
           COALESCE(v.day, o.day) AS day,
           COALESCE(v.visitors, 0) AS visitors,
           COALESCE(o.orders, 0) AS orders,
           COALESCE(o.revenue_gross, 0) AS revenue_gross,
           COALESCE(o.revenue_net, 0) AS revenue_net
    FROM visitors v
    FULL OUTER JOIN orders o ON o.variant_id = v.variant_id AND o.day = v.day
  `;
}

/**
 * Materialises DailyStat for every experiment that was live in the window. Default window: the day before `now` in
 * each shop's own timezone plus the current day, so a job running at 03:00 local time closes yesterday properly and
 * a manual re-run during the day refreshes today.
 */
export async function materialiseDailyStats(opts: { now?: Date; days?: number; db?: Db } = {}): Promise<DailyStatsResult> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const days = opts.days ?? 2;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const experiments = await db.experiment.findMany({
    where: { status: { in: ["RUNNING", "PAUSED", "ENDED"] }, startedAt: { not: null } },
    include: { shop: { select: { timezone: true } } },
  });

  const result: DailyStatsResult = { experiments: 0, days: 0, rows: 0, skipped: [] };
  const seenDays = new Set<string>();

  for (const experiment of experiments) {
    // An experiment that ended before the window has nothing new to say.
    if (experiment.endedAt && experiment.endedAt < from) continue;
    const tz = experiment.shop.timezone ?? "UTC";
    let rows: DayRow[];
    try {
      rows = await dailyRowsFor(experiment, tz, from, now, db);
    } catch (err) {
      result.skipped.push({ experimentId: experiment.id, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }
    result.experiments++;

    for (const row of rows) {
      const date = new Date(`${row.day}T00:00:00.000Z`); // @db.Date – the calendar day, stored without a zone
      const data = {
        visitors: row.visitors,
        orders: row.orders,
        revenueGross: row.revenue_gross.toFixed(2),
        revenueNet: row.revenue_net.toFixed(2),
      } satisfies Partial<Prisma.DailyStatUncheckedCreateInput>;
      await db.dailyStat.upsert({
        where: { experimentId_variantId_date: { experimentId: experiment.id, variantId: row.variant_id, date } },
        create: { shopId: experiment.shopId, experimentId: experiment.id, variantId: row.variant_id, date, ...data },
        update: data,
      });
      result.rows++;
      seenDays.add(`${experiment.id}:${row.day}`);
    }
  }

  result.days = seenDays.size;
  const excluded = experiments.filter((e) => taintedDays(e).length > 0).length;
  console.log(
    `[jobs/daily-stats] ${result.rows} rows for ${result.experiments} experiments since ${from.toISOString()}` +
      (excluded ? ` (${excluded} with tainted days – kept in the history on purpose)` : ""),
  );
  return result;
}
