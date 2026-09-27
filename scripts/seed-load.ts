/**
 * Load fixture for the WP4 target "< 500 ms at 1 M exposures" (plan WP4 / ADR-0019).
 *
 * Creates ONE synthetic shop with a fresh, timestamped domain and fills it with ~1 M exposures and ~30 k orders, then
 * runs the live aggregation and prints the timings. Everything is generated inside Postgres with generate_series, so
 * nothing travels over the wire.
 *
 * This runs against the LOCAL Postgres only (CLAUDE.md: the Render database is production). The script refuses any
 * DATABASE_URL that is not localhost.
 *
 * It never deletes anything – every run leaves its shop behind. To reclaim the space afterwards, Joel runs (by hand,
 * after checking what is there):
 *
 *   psql sh_ab_dev -c "SELECT domain, (SELECT COUNT(*) FROM \"Exposure\" e WHERE e.\"shopId\" = s.id) FROM \"Shop\" s WHERE s.domain LIKE 'loadtest-%'"
 *
 * and then deletes the rows of the shops he no longer wants.
 *
 *   pnpm seed:load [exposures] [orders]
 */
import prisma from "../app/db.server";
import { computeExperimentStats } from "../app/services/stats.server";

const EXPOSURES = Number(process.argv[2] ?? 1_000_000);
const ORDERS = Number(process.argv[3] ?? 30_000);
const DAYS = 30;

function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/]+)/)?.[1] ?? "";
  if (!["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error(`seed-load refuses to touch a non-local database (host "${host}"). Local Postgres only.`);
  }
}

async function main() {
  assertLocal();
  const stamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  const domain = `loadtest-${stamp}.myshopify.com`;
  // Row ids and synthetic customer ids carry the run stamp, so a second run adds a second fixture instead of
  // colliding with the first one. Nothing is ever overwritten or removed.
  const p = `l${stamp}`;
  const startedAt = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  console.log(`Seeding ${EXPOSURES.toLocaleString("de-DE")} exposures and ${ORDERS.toLocaleString("de-DE")} orders into ${domain}`);

  const shop = await prisma.shop.create({
    data: { domain, name: "Load test", status: "ACTIVE", timezone: "Europe/Berlin", installedAt: startedAt, activatedAt: startedAt },
  });
  const experiment = await prisma.experiment.create({
    data: {
      shopId: shop.id,
      key: "load-test",
      name: "Load test",
      status: "RUNNING",
      salt: "load",
      targeting: {},
      trigger: { type: "immediate" },
      primaryMetric: "CR",
      plannedSampleSize: Math.floor(EXPOSURES / 4),
      startedAt,
      variants: {
        create: [
          { key: "a", name: "Control", weight: 0.5, isControl: true },
          { key: "b", name: "Variant B", weight: 0.5 },
        ],
      },
    },
    include: { variants: { orderBy: { key: "asc" } } },
  });
  const [a, b] = experiment.variants;

  const t = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    const out = await fn();
    console.log(`  ${label}: ${(performance.now() - start).toFixed(0)} ms`);
    return out;
  };

  // 1 M exposures: 50/50 split by parity, ~2 % bots, 20 % carry a customerId (the login link of 4.5), spread over
  // DAYS days. The day comes from g/33, not g % DAYS: with an even DAYS the latter would put every calendar day
  // entirely in one arm, which makes a tainted day look like it only ever hits one variant.
  await t("exposures", () =>
    prisma.$executeRawUnsafe(
      `
      INSERT INTO "Exposure" (id, "shopId", "experimentId", "variantId", "visitorId", "customerId", "firstSeenAt", device, "isBot", "createdAt")
      SELECT '${p}x' || g, $1, $2,
             CASE WHEN g % 2 = 0 THEN $3 ELSE $4 END,
             '${p}v' || g,
             CASE WHEN g % 5 = 0 THEN '${p}c' || g ELSE NULL END,
             $5::timestamp + ((g / 33)::int % ${DAYS}) * interval '1 day' + ((g % 1440) * interval '1 minute'),
             (ARRAY['mobile','desktop','tablet'])[1 + (g % 3)],
             g % 50 = 0,
             now()
      FROM generate_series(1, ${EXPOSURES}) g
      `,
      shop.id,
      experiment.id,
      a.id,
      b.id,
      startedAt,
    ),
  );

  // ~30 k orders. Every third one belongs to an exposed customer, so it links back to that visitor and inherits its
  // device; the rest are guest orders, which is the realistic majority (ADR-0032).
  //
  // `gg` is the exposure index the order belongs to. It has to satisfy three things at once or the link never fires:
  // a multiple of 5 (only those exposures carry a customerId), the same parity as g (exposures and orders both split
  // by parity, so opposite parities would always mean "attributed to a variant the customer never saw"), and an
  // exposure timestamp before the order. gg = 10·m + 5·(g mod 2) gives the first two; deriving the order's timestamp
  // from gg and adding two hours gives the third.
  const linkModulus = Math.max(Math.floor(EXPOSURES / 10) - 2, 1);
  await t("orders", () =>
    prisma.$executeRawUnsafe(
      `
      INSERT INTO "Order" (id, "shopId", "shopifyOrderId", "orderNumber", "createdAt", currency, "totalPrice", "subtotalPrice",
                           "totalShipping", "totalTax", "totalDiscounts", "financialStatus", "customerId", "sourceName", "isTest", raw, "ingestedAt", "updatedAt")
      SELECT '${p}o' || g, $1, 'shopify-' || g, '#' || g,
             $2::timestamp + ((gg / 33)::int % ${DAYS}) * interval '1 day' + ((gg % 1440) * interval '1 minute') + interval '2 hours',
             'EUR',
             ROUND((20 + (g % 400))::numeric, 2), ROUND((18 + (g % 400))::numeric, 2), 4.90, 0, 0,
             'paid',
             CASE WHEN g % 3 = 0 THEN '${p}c' || gg ELSE NULL END,
             CASE WHEN g % 97 = 0 THEN 'pos' ELSE 'web' END,
             g % 101 = 0,
             '{}'::jsonb, now(), now()
      FROM (
        SELECT g, CASE WHEN g % 3 = 0 THEN 10 * ((g * 3) % ${linkModulus} + 1) + 5 * (g % 2) ELSE g END AS gg
        FROM generate_series(1, ${ORDERS}) g
      ) s
      `,
      shop.id,
      startedAt,
    ),
  );

  await t("attributions", () =>
    prisma.$executeRawUnsafe(
      `
      INSERT INTO "OrderAttribution" ("orderId", "experimentId", "variantId", source, "createdAt")
      SELECT '${p}o' || g, $1, CASE WHEN g % 2 = 0 THEN $2 ELSE $3 END, 'CART_ATTRIBUTE', now()
      FROM generate_series(1, ${ORDERS}) g
      `,
      experiment.id,
      a.id,
      b.id,
    ),
  );

  // ~5 % of orders get a partial refund.
  await t("refunds", () =>
    prisma.$executeRawUnsafe(
      `
      INSERT INTO "Refund" (id, "orderId", "shopifyRefundId", amount, "createdAt", "ingestedAt")
      SELECT '${p}r' || g, '${p}o' || g, '${p}refund-' || g, 10.00,
             $1::timestamp + ((g / 33)::int % ${DAYS}) * interval '1 day' + interval '2 hours', now()
      FROM generate_series(1, ${ORDERS}) g WHERE g % 20 = 0
      `,
      startedAt,
    ),
  );

  await t("ANALYZE", () => prisma.$executeRawUnsafe(`ANALYZE "Exposure", "Order", "OrderAttribution", "Refund"`));

  console.log("\nLive aggregation (the number WP4 cares about):");
  const timings: number[] = [];
  for (let run = 1; run <= 5; run++) {
    const start = performance.now();
    const stats = await computeExperimentStats(experiment.id);
    const ms = performance.now() - start;
    timings.push(ms);
    if (run === 1) {
      console.log(
        `  visitors ${stats.variants.map((v) => `${v.key}=${v.visitors.toLocaleString("de-DE")}`).join(" ")} · ` +
          `orders ${stats.variants.map((v) => `${v.key}=${v.orders}`).join(" ")} · ` +
          `cr ${stats.variants.map((v) => `${v.key}=${(v.cr * 100).toFixed(2)} %`).join(" ")} · ` +
          `device link rate ${(stats.deviceLinkRate * 100).toFixed(1)} %`,
      );
    }
    console.log(`  run ${run}: ${ms.toFixed(0)} ms`);
  }
  const sorted = [...timings].sort((x, y) => x - y);
  console.log(`  median ${sorted[2].toFixed(0)} ms · best ${sorted[0].toFixed(0)} ms · worst ${sorted[4].toFixed(0)} ms`);
  console.log(`\nShop ${domain} (id ${shop.id}), experiment ${experiment.id}. Nothing was deleted.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
