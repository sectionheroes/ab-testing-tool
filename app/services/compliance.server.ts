import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { logAudit } from "./audit.server";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function customerIdOf(payload: Json): string | null {
  const c = payload.customer;
  if (!isObject(c) || c.id === undefined || c.id === null) return null;
  return String(c.id);
}

/**
 * customers/data_request: collect every Exposure and Order row for that customer into a JSON export. Stored on the
 * WebhookEvent (payload), logged here, reported by the Slack digest (WP6); the store owner gets it from us manually
 * within 30 days (ADR-0099 h). Rows are already PII-free, so the export contains ids, timestamps and amounts only.
 */
export async function handleCustomerDataRequest(shopId: string, eventId: string, payload: Json): Promise<{ exposures: number; orders: number }> {
  const customerId = customerIdOf(payload);
  if (!customerId) {
    console.log(`[customers/data_request] no customer id in payload – nothing to export`);
    return { exposures: 0, orders: 0 };
  }
  const [exposures, orders] = await Promise.all([
    prisma.exposure.findMany({
      where: { shopId, customerId },
      select: { experimentId: true, variantId: true, visitorId: true, firstSeenAt: true, device: true, country: true, referrer: true, utm: true },
    }),
    prisma.order.findMany({
      where: { shopId, customerId },
      select: {
        shopifyOrderId: true,
        orderNumber: true,
        createdAt: true,
        currency: true,
        totalPrice: true,
        financialStatus: true,
        attributions: { select: { experimentId: true, variantId: true, source: true } },
        refunds: { select: { shopifyRefundId: true, amount: true, createdAt: true } },
      },
    }),
  ]);
  const requestId = isObject(payload.data_request) ? payload.data_request.id : undefined;
  const exportJson = {
    kind: "customers/data_request",
    customerId,
    requestId: requestId ?? null,
    ordersRequested: Array.isArray(payload.orders_requested) ? payload.orders_requested : [],
    exportedAt: new Date().toISOString(),
    exposures,
    orders,
  };
  await prisma.webhookEvent.update({ where: { id: eventId }, data: { payload: JSON.parse(JSON.stringify(exportJson)) as Prisma.InputJsonObject } });
  console.log(`[customers/data_request] shop ${shopId} customer ${customerId}: ${exposures.length} exposures, ${orders.length} orders exported to WebhookEvent ${eventId}`);
  return { exposures: exposures.length, orders: orders.length };
}

/** customers/redact: null the customer link on Exposure and Order. Nothing else is stored (stripPii). */
export async function handleCustomerRedact(shopId: string, payload: Json): Promise<{ exposures: number; orders: number }> {
  const customerId = customerIdOf(payload);
  if (!customerId) return { exposures: 0, orders: 0 };
  const [e, o] = await prisma.$transaction([
    prisma.exposure.updateMany({ where: { shopId, customerId }, data: { customerId: null } }),
    prisma.order.updateMany({ where: { shopId, customerId }, data: { customerId: null } }),
  ]);
  console.log(`[customers/redact] shop ${shopId} customer ${customerId}: ${e.count} exposures, ${o.count} orders unlinked`);
  return { exposures: e.count, orders: o.count };
}

export type ShopRedactResult =
  | { skipped: "reinstalled" }
  | { deleted: { attributions: number; refunds: number; lineItems: number; orders: number; exposures: number; reconciliationRuns: number; webhookEvents: number } };

/**
 * shop/redact (plan 8.6, ADR-0024): delete Order, OrderLineItem, OrderAttribution, Refund, Exposure, WebhookEvent,
 * ReconciliationRun and the token. Keep Shop, Experiment, Variant, AuditLog, ExperimentResult, DailyStat.
 * Reinstall within the 48 h before the redact arrives (plan 8.6): the install flow sets the status back to
 * ACTIVE/PENDING, so anything other than UNINSTALLED means "reinstalled" and nothing is deleted.
 * `currentEventId` survives so this webhook stays idempotent.
 */
export async function handleShopRedact(shopId: string, currentEventId: string): Promise<ShopRedactResult> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { domain: true, status: true } });
  if (!shop) throw new Error(`shop ${shopId} not found`);
  if (shop.status !== "UNINSTALLED") {
    console.log(`[shop/redact] ${shop.domain} is ${shop.status} – reinstalled within 48 h, nothing deleted`);
    return { skipped: "reinstalled" };
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const attributions = await tx.orderAttribution.deleteMany({ where: { order: { shopId } } });
    const refunds = await tx.refund.deleteMany({ where: { order: { shopId } } });
    const lineItems = await tx.orderLineItem.deleteMany({ where: { order: { shopId } } });
    const orders = await tx.order.deleteMany({ where: { shopId } });
    const exposures = await tx.exposure.deleteMany({ where: { shopId } });
    const reconciliationRuns = await tx.reconciliationRun.deleteMany({ where: { shopId } });
    const webhookEvents = await tx.webhookEvent.deleteMany({ where: { shopId, id: { not: currentEventId } } });
    await tx.shop.update({ where: { id: shopId }, data: { accessToken: null, session: null } });
    return {
      attributions: attributions.count,
      refunds: refunds.count,
      lineItems: lineItems.count,
      orders: orders.count,
      exposures: exposures.count,
      reconciliationRuns: reconciliationRuns.count,
      webhookEvents: webhookEvents.count,
    };
  });
  await logAudit({ shopId, actor: `shopify:${shop.domain}`, action: "UPDATED", diff: { shopRedact: deleted } });
  console.log(`[shop/redact] ${shop.domain}: ${JSON.stringify(deleted)}`);
  return { deleted };
}
