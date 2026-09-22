import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { stripPii } from "./pii";

export { stripPii } from "./pii";

/**
 * One topic string for every consumer: Shopify's `orders/create` form. The SDK hands us the GraphQL enum
 * (`ORDERS_CREATE`, `CUSTOMERS_DATA_REQUEST`, `APP_SCOPES_UPDATE`); the first `_` is the resource separator.
 * Already-normalised input passes through unchanged.
 */
export function normalizeTopic(topic: string): string {
  const t = topic.trim();
  if (t.includes("/")) return t.toLowerCase();
  return t.toLowerCase().replace("_", "/");
}

export type RecordResult = { result: "created"; eventId: string; shopId: string } | { result: "duplicate" } | { result: "unknown_shop" };

/**
 * Idempotent on X-Shopify-Webhook-Id: a redelivery returns "duplicate" and the caller answers 200 without
 * processing. The row is written without payload (ADR-0024) – markFailed() adds the stripped body on error.
 */
export async function recordWebhookEvent(input: { shopDomain: string; topic: string; webhookId: string }): Promise<RecordResult> {
  const shop = await prisma.shop.findUnique({ where: { domain: input.shopDomain }, select: { id: true } });
  if (!shop) return { result: "unknown_shop" };

  try {
    const event = await prisma.webhookEvent.create({
      data: { shopId: shop.id, topic: normalizeTopic(input.topic), shopifyId: input.webhookId },
      select: { id: true },
    });
    return { result: "created", eventId: event.id, shopId: shop.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { result: "duplicate" };
    throw err;
  }
}

/** Success: processedAt set, error and payload cleared (payload only ever lives on failed events). */
export async function markProcessed(eventId: string, keepPayload = false) {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), error: null, ...(keepPayload ? {} : { payload: Prisma.DbNull }) },
  });
}

/** Failure: error + attempts++ and the PII-stripped body so /jobs/retry-webhooks can re-run it. */
export async function markFailed(eventId: string, err: unknown, payload: Record<string, unknown>) {
  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: {
      error: errorMessage(err),
      attempts: { increment: 1 },
      payload: stripPii(payload) as Prisma.InputJsonObject,
    },
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 2000);
  return String(err).slice(0, 2000);
}

export function listRecentWebhookEvents(shopId: string, take = 50) {
  return prisma.webhookEvent.findMany({
    where: { shopId },
    orderBy: { receivedAt: "desc" },
    take,
    select: { id: true, topic: true, shopifyId: true, receivedAt: true, processedAt: true, attempts: true, error: true },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
