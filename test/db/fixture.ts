/**
 * Fixtures for the database-backed tests.
 *
 * Every test body runs inside `prisma.$transaction(tx => …)` and the transaction is rolled back at the end, so the
 * tests never delete a row and never leave one behind – which is what CLAUDE.md's rule against destructive database
 * commands asks for. They need a migrated local Postgres (`pnpm db:migrate`); `pnpm test:db` runs them.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../app/db.server";

export type Tx = Prisma.TransactionClient;

class Rollback extends Error {
  constructor(public readonly value: unknown) {
    super("rollback");
  }
}

/** Runs `fn` in a transaction and rolls it back afterwards, whether it succeeded or not. */
export async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(async (tx) => {
      throw new Rollback(await fn(tx));
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (err) {
    if (err instanceof Rollback) return err.value as T;
    throw err;
  }
  throw new Error("inRollback: transaction did not roll back");
}

let counter = 0;
const uid = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export type SeededExperiment = Awaited<ReturnType<typeof seedExperiment>>;

/** A shop with one two-arm experiment. Everything carries a unique id so parallel test files cannot collide. */
export async function seedExperiment(
  tx: Tx,
  opts: {
    timezone?: string;
    startedAt?: Date;
    endedAt?: Date | null;
    plannedSampleSize?: number | null;
    primaryMetric?: "CR" | "RPV" | "AOV";
    taintedDays?: string[];
  } = {},
) {
  const id = uid();
  const shop = await tx.shop.create({
    data: { domain: `${id}.myshopify.com`, name: "Test shop", status: "ACTIVE", timezone: opts.timezone ?? "Europe/Berlin" },
  });
  const experiment = await tx.experiment.create({
    data: {
      shopId: shop.id,
      key: `exp-${id}`,
      name: "Test experiment",
      status: opts.endedAt ? "ENDED" : "RUNNING",
      salt: "salt",
      targeting: {},
      trigger: { type: "immediate" },
      primaryMetric: opts.primaryMetric ?? "CR",
      plannedSampleSize: opts.plannedSampleSize === undefined ? 1 : opts.plannedSampleSize,
      startedAt: opts.startedAt ?? new Date("2026-10-01T00:00:00Z"),
      endedAt: opts.endedAt ?? null,
      decision: opts.endedAt ? "NO_DIFFERENCE" : null,
      taintedDays: opts.taintedDays ?? [],
      variants: {
        create: [
          { key: "a", name: "Control", weight: 0.5, isControl: true },
          { key: "b", name: "Variant B", weight: 0.5 },
        ],
      },
    },
    include: { variants: { orderBy: { key: "asc" } }, shop: { select: { id: true, timezone: true } } },
  });
  return { id, shop, experiment, a: experiment.variants[0], b: experiment.variants[1] };
}

export async function addExposure(
  tx: Tx,
  f: SeededExperiment,
  opts: { variant?: "a" | "b"; visitorId?: string; customerId?: string | null; at: string; device?: string; isBot?: boolean },
) {
  const visitorId = opts.visitorId ?? `${f.id}-v${uid()}`;
  return tx.exposure.create({
    data: {
      shopId: f.shop.id,
      experimentId: f.experiment.id,
      variantId: (opts.variant ?? "a") === "a" ? f.a.id : f.b.id,
      visitorId,
      customerId: opts.customerId ?? null,
      firstSeenAt: new Date(opts.at),
      device: opts.device ?? "mobile",
      isBot: opts.isBot ?? false,
    },
  });
}

export async function addOrder(
  tx: Tx,
  f: SeededExperiment,
  opts: {
    variant?: "a" | "b";
    at: string;
    total?: number;
    customerId?: string | null;
    sourceName?: string;
    isTest?: boolean;
    cancelledAt?: string | null;
    refund?: number;
    attribute?: boolean;
  },
) {
  const id = uid();
  const order = await tx.order.create({
    data: {
      shopId: f.shop.id,
      shopifyOrderId: `${f.id}-${id}`,
      orderNumber: `#${id}`,
      createdAt: new Date(opts.at),
      currency: "EUR",
      totalPrice: (opts.total ?? 100).toFixed(2),
      subtotalPrice: (opts.total ?? 100).toFixed(2),
      totalShipping: "0.00",
      totalTax: "0.00",
      totalDiscounts: "0.00",
      financialStatus: "paid",
      cancelledAt: opts.cancelledAt ? new Date(opts.cancelledAt) : null,
      customerId: opts.customerId ?? null,
      sourceName: opts.sourceName ?? "web",
      isTest: opts.isTest ?? false,
      raw: {},
    },
  });
  if (opts.attribute !== false) {
    await tx.orderAttribution.create({
      data: {
        orderId: order.id,
        experimentId: f.experiment.id,
        variantId: (opts.variant ?? "a") === "a" ? f.a.id : f.b.id,
        source: "CART_ATTRIBUTE",
      },
    });
  }
  if (opts.refund) {
    await tx.refund.create({
      data: { orderId: order.id, shopifyRefundId: `${f.id}-r${id}`, amount: opts.refund.toFixed(2), createdAt: new Date(opts.at) },
    });
  }
  return order;
}
