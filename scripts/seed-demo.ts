/**
 * Demo data for working on the dashboard and for the acceptance screenshots: five shops, experiments in every status,
 * a frozen snapshot per ended test, reconciliation runs and a few dashboard users.
 *
 * **Local development database only** (`requireLocalDatabase`), and it only ever *creates* rows – an experiment that
 * already exists is skipped, nothing is deleted or reset (CLAUDE.md).
 *
 * Run: `pnpm seed:demo`
 */
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./local-only";

requireLocalDatabase("seed:demo");
const prisma = new PrismaClient();

const SHOPS = [
  { domain: "wunderwunsch-demo.myshopify.com", name: "Wunderwunsch" },
  { domain: "tierliebhaber-demo.myshopify.com", name: "Tierliebhaber" },
  { domain: "betterbebold-demo.myshopify.com", name: "BetterBeBold" },
  { domain: "ganz24-demo.myshopify.com", name: "Ganz24" },
  { domain: "nordmut-demo.myshopify.com", name: "Nordmut" },
];

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY);

type Spec = {
  shop: number;
  key: string;
  name: string;
  status: "DRAFT" | "RUNNING" | "PAUSED" | "ENDED";
  metric?: "CR" | "RPV" | "AOV";
  startedDaysAgo?: number;
  endedDaysAgo?: number;
  /** visitors per arm */
  visitors?: number;
  /** converting visitors in arm a / arm b */
  conv?: [number, number];
  /** blow up the split so the SRM check fires */
  srm?: boolean;
  decision?: "WINNER" | "NO_DIFFERENCE";
  winnerLift?: number;
  hypothesis?: string;
  url?: string;
};

const SPECS: Spec[] = [
  {
    shop: 0,
    key: "pdp-reviews-above-price",
    name: "PDP: Reviews above price",
    status: "RUNNING",
    startedDaysAgo: 10,
    visitors: 6200,
    conv: [455, 500],
    hypothesis:
      "If we show the star rating above the price, more visitors add to cart, because they see social proof before they see the price.",
    url: "/products/",
  },
  {
    shop: 1,
    key: "cart-free-shipping-bar",
    name: "Cart: Free-shipping progress bar",
    status: "RUNNING",
    startedDaysAgo: 22,
    visitors: 14000,
    conv: [1060, 1124],
    metric: "RPV",
    url: "/cart",
  },
  {
    shop: 4,
    key: "homepage-hero-video",
    name: "Homepage: Hero video",
    status: "RUNNING",
    startedDaysAgo: 16,
    visitors: 12800,
    conv: [1030, 1041],
    url: "/",
  },
  {
    shop: 2,
    key: "collection-three-column-grid",
    name: "Collection: 3-column grid",
    status: "RUNNING",
    startedDaysAgo: 5,
    visitors: 2000,
    conv: [100, 114],
    srm: true,
    url: "/collections/",
  },
  {
    shop: 3,
    key: "checkout-trust-badges",
    name: "Checkout: Trust badges",
    status: "PAUSED",
    startedDaysAgo: 8,
    visitors: 4300,
    conv: [310, 372],
    url: "/checkout",
  },
  { shop: 0, key: "navigation-mega-menu", name: "Navigation: Mega menu", status: "DRAFT", url: "/" },
  { shop: 0, key: "pdp-sticky-add-to-cart", name: "PDP: Sticky add-to-cart", status: "DRAFT", url: "/products/" },
  {
    shop: 0,
    key: "pdp-bundle-upsell",
    name: "PDP: Bundle upsell",
    status: "ENDED",
    startedDaysAgo: 58,
    endedDaysAgo: 30,
    visitors: 15200,
    conv: [1180, 1252],
    decision: "WINNER",
    winnerLift: 0.061,
  },
  {
    shop: 3,
    key: "cart-drawer-cross-sell",
    name: "Cart drawer: Cross-sell",
    status: "ENDED",
    startedDaysAgo: 73,
    endedDaysAgo: 38,
    visitors: 14000,
    conv: [1030, 1074],
    metric: "RPV",
    decision: "WINNER",
    winnerLift: 0.039,
  },
  {
    shop: 1,
    key: "search-instant-overlay",
    name: "Search: Instant overlay",
    status: "ENDED",
    startedDaysAgo: 65,
    endedDaysAgo: 44,
    visitors: 13500,
    conv: [1020, 1016],
    decision: "NO_DIFFERENCE",
  },
  {
    shop: 2,
    key: "pdp-price-anchoring",
    name: "PDP: Price anchoring",
    status: "ENDED",
    startedDaysAgo: 79,
    endedDaysAgo: 65,
    visitors: 12000,
    conv: [600, 580],
    decision: "NO_DIFFERENCE",
  },
  {
    shop: 4,
    key: "popup-newsletter-delay",
    name: "Popup: Newsletter delay 30 s",
    status: "ENDED",
    startedDaysAgo: 92,
    endedDaysAgo: 71,
    visitors: 13000,
    conv: [1010, 1002],
    decision: "NO_DIFFERENCE",
  },
];

async function main() {
  const shopIds: string[] = [];
  for (const s of SHOPS) {
    const shop = await prisma.shop.upsert({
      where: { domain: s.domain },
      update: { name: s.name, status: "ACTIVE", timezone: "Europe/Berlin" },
      create: { domain: s.domain, name: s.name, status: "ACTIVE", timezone: "Europe/Berlin", installedAt: ago(120), activatedAt: ago(120) },
    });
    shopIds.push(shop.id);
  }

  for (const spec of SPECS) {
    const shopId = shopIds[spec.shop];
    const existing = await prisma.experiment.findUnique({ where: { shopId_key: { shopId, key: spec.key } } });
    if (existing) {
      console.log(`skip ${spec.key} (exists)`);
      continue;
    }

    const experiment = await prisma.experiment.create({
      data: {
        shopId,
        key: spec.key,
        name: spec.name,
        hypothesis: spec.hypothesis ?? null,
        status: spec.status,
        salt: Math.random().toString(16).slice(2, 6),
        allocation: 1,
        targeting: { url: { match: "contains", value: spec.url ?? "/" }, device: ["mobile", "desktop", "tablet"] },
        trigger: { type: "immediate" },
        primaryMetric: spec.metric ?? "CR",
        minConversionsPerArm: 1000,
        minDurationDays: 14,
        requireFullWeeks: true,
        startedAt: spec.startedDaysAgo ? ago(spec.startedDaysAgo) : null,
        endedAt: spec.endedDaysAgo ? ago(spec.endedDaysAgo) : null,
        decision: spec.decision ?? null,
        conclusion: spec.decision === "WINNER" ? "Shipped to everyone." : spec.decision ? "Kept the original." : null,
        variants: {
          create: [
            { key: "a", name: "Control", weight: 0.5, isControl: true },
            { key: "b", name: spec.name.split(": ")[1] ?? "Variant B", weight: 0.5, js: "document.querySelector('.product__rating');", css: ".shab-rating-top { margin-bottom: 8px; }" },
          ],
        },
      },
      include: { variants: { orderBy: { key: "asc" } } },
    });
    const [a, b] = experiment.variants;

    await prisma.auditLog.create({ data: { shopId, experimentId: experiment.id, actor: "joel@sectionheroes.de", action: "CREATED", at: spec.startedDaysAgo ? ago(spec.startedDaysAgo + 1) : new Date() } });
    if (spec.startedDaysAgo) {
      await prisma.auditLog.create({
        data: { shopId, experimentId: experiment.id, actor: "joel@sectionheroes.de", action: "STATUS_CHANGED", diff: { from: "DRAFT", to: "RUNNING" }, at: ago(spec.startedDaysAgo) },
      });
    }
    if (spec.status === "PAUSED") {
      await prisma.auditLog.create({
        data: { shopId, experimentId: experiment.id, actor: "joel@sectionheroes.de", action: "STATUS_CHANGED", diff: { from: "RUNNING", to: "PAUSED" }, at: ago(2) },
      });
    }

    // ENDED experiments read the frozen snapshot, so they need no raw rows at all (ADR-0025).
    if (spec.status === "ENDED") {
      const [ca, cb] = spec.conv!;
      const v = spec.visitors!;
      const metric = spec.metric ?? "CR";
      const mk = (key: string, isControl: boolean, converters: number, lift: number | null) => ({
        key,
        name: key === "a" ? "Control" : "Variant B",
        isControl,
        weight: 0.5,
        visitors: v,
        converters,
        orders: Math.round(converters * 1.12),
        revenue: Math.round(converters * 1.12 * 74.5),
        cr: converters / v,
        rpv: (converters * 1.12 * 74.5) / v,
        aov: 74.5,
        lift,
        ci: lift === null ? null : [lift - 0.02, lift + 0.02],
        pValue: lift === null ? null : 0.012,
        significant: lift !== null,
        metrics: {
          CR: { estimate: converters / v, lift: metric === "CR" ? lift : lift, ci: null, diff: null, diffCi: null, pValue: null, test: null },
          RPV: { estimate: (converters * 1.12 * 74.5) / v, lift, ci: null, diff: null, diffCi: null, pValue: null, test: null },
          AOV: { estimate: 74.5, lift: lift === null ? null : lift / 3, ci: null, diff: null, diffCi: null, pValue: null, test: null },
        },
        byDevice: {},
        warnings: [],
      });
      const winner = spec.decision === "WINNER" ? "b" : null;
      const lossLift = spec.key === "pdp-price-anchoring" ? -0.021 : null;
      await prisma.experimentResult.create({
        data: {
          experimentId: experiment.id,
          shopId,
          v: 1,
          statsVersion: "2.0.0",
          frozenAt: ago(spec.endedDaysAgo!),
          snapshot: {
            numbers: {
              statsVersion: "2.0.0",
              primaryMetric: metric,
              winner,
              significant: winner !== null,
              stoppingRule: { met: true, converterFloor: Math.min(ca, cb), elapsedDays: spec.startedDaysAgo! - spec.endedDaysAgo! },
              srm: { alarm: false, pValue: 0.42 },
              variants: [mk("a", true, ca, null), mk("b", false, cb, winner ? spec.winnerLift! : lossLift)],
            },
            frozen: { hypothesis: spec.hypothesis ?? null, primaryMetric: metric },
            verdict: { decision: spec.decision, conclusion: spec.decision === "WINNER" ? "Shipped to everyone." : "Kept the original." },
          },
        },
      });
      console.log(`seeded ${spec.key} (ended, snapshot only)`);
      continue;
    }

    if (!spec.visitors) {
      console.log(`seeded ${spec.key} (${spec.status})`);
      continue;
    }

    // RUNNING / PAUSED: real exposures and orders, so the live query produces the numbers.
    const started = ago(spec.startedDaysAgo!);
    const span = (now - started.getTime()) * 0.95;
    const perArm = spec.srm ? [Math.round(spec.visitors * 0.82), Math.round(spec.visitors * 0.18)] : [spec.visitors, spec.visitors];
    const devices = ["mobile", "mobile", "desktop", "tablet"];

    for (const [i, variant] of [a, b].entries()) {
      const count = perArm[i];
      const converters = spec.conv![i];
      const exposures: { shopId: string; experimentId: string; variantId: string; visitorId: string; firstSeenAt: Date; device: string; isNewVisitor: boolean }[] = [];
      for (let n = 0; n < count; n++) {
        exposures.push({
          shopId,
          experimentId: experiment.id,
          variantId: variant.id,
          visitorId: `${spec.key}-${variant.key}-${n}`,
          firstSeenAt: new Date(started.getTime() + (n / count) * span),
          device: devices[n % devices.length],
          isNewVisitor: n % 3 !== 0,
        });
      }
      for (let chunk = 0; chunk < exposures.length; chunk += 2000) {
        await prisma.exposure.createMany({ data: exposures.slice(chunk, chunk + 2000), skipDuplicates: true });
      }

      for (let n = 0; n < converters; n++) {
        const visitorId = `${spec.key}-${variant.key}-${Math.floor((n / converters) * count)}`;
        const at = new Date(started.getTime() + (n / converters) * span + 3_600_000);
        const total = 40 + ((n * 37) % 160);
        const order = await prisma.order.create({
          data: {
            shopId,
            shopifyOrderId: `${spec.key}-${variant.key}-o${n}`,
            orderNumber: `#${1000 + n}`,
            createdAt: at,
            currency: "EUR",
            totalPrice: total.toFixed(2),
            subtotalPrice: total.toFixed(2),
            totalShipping: "0.00",
            totalTax: "0.00",
            totalDiscounts: "0.00",
            financialStatus: "paid",
            sourceName: "web",
            raw: {},
          },
        });
        await prisma.orderAttribution.create({
          data: { orderId: order.id, experimentId: experiment.id, variantId: variant.id, visitorId, source: "CART_ATTRIBUTE" },
        });
      }
    }
    console.log(`seeded ${spec.key} (${spec.status}, ${perArm[0]}+${perArm[1]} visitors)`);
  }

  // One pending shop and one allowlisted one, so the Shops page shows every status.
  await prisma.shop.upsert({
    where: { domain: "knusperliebe-demo.myshopify.com" },
    update: { status: "PENDING" },
    create: { domain: "knusperliebe-demo.myshopify.com", name: "Knusperliebe", status: "PENDING", installedAt: ago(2) },
  });
  await prisma.shop.upsert({
    where: { domain: "shinychiefs-demo.myshopify.com" },
    update: { status: "ALLOWLISTED" },
    create: { domain: "shinychiefs-demo.myshopify.com", name: "ShinyChiefs", status: "ALLOWLISTED" },
  });

  // Reconciliation history for two shops.
  for (const shopId of shopIds.slice(0, 2)) {
    for (let d = 1; d <= 6; d++) {
      const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - d));
      const existing = await prisma.reconciliationRun.findFirst({ where: { shopId, date } });
      if (existing) continue;
      const mismatch = d === 3;
      await prisma.reconciliationRun.create({
        data: {
          shopId,
          date,
          ourOrderCount: mismatch ? 214 : 231,
          shopifyOrderCount: 231,
          ourRevenue: mismatch ? "16540.20" : "17890.40",
          shopifyRevenue: "17890.40",
          status: mismatch ? "MISMATCH" : "OK",
        },
      });
    }
  }

  // A couple of dashboard users, so the Users page is not a single row.
  for (const [email, role] of [
    ["joel@sectionheroes.de", "ADMIN"],
    ["shayem@sectionheroes.de", "MEMBER"],
    ["kundin@wunderwunsch.de", "CLIENT"],
  ] as const) {
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, role, name: email.split("@")[0] } });
    if (role === "CLIENT") {
      await prisma.userShop.upsert({ where: { userId_shopId: { userId: user.id, shopId: shopIds[0] } }, update: {}, create: { userId: user.id, shopId: shopIds[0] } });
    }
  }

  console.log("done");
}

main().finally(() => prisma.$disconnect());
