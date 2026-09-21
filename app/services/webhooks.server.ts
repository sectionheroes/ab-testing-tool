import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { storeWebhookPayloads } from "../env.server";

/**
 * Removes customer PII before anything is persisted. WP1 version: top-level keys plus `customer` reduced to
 * its id. WP2 completes it (nested addresses inside fulfillments/refunds, fixture-based tests).
 */
const STRIP_KEYS = [
  "billing_address",
  "shipping_address",
  "email",
  "contact_email",
  "phone",
  "note",
  "client_details",
  "payment_details",
  "browser_ip",
  "fulfillments",
] as const;

export function stripPii<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  for (const key of STRIP_KEYS) delete out[key];
  if (out.customer && typeof out.customer === "object") {
    const id = (out.customer as { id?: unknown }).id;
    out.customer = id === undefined ? null : { id };
  }
  return out;
}

export type RecordResult = "created" | "duplicate" | "unknown_shop";

/**
 * Idempotent on X-Shopify-Webhook-Id: a redelivery returns "duplicate" and the caller answers 200 without
 * processing. Payload is persisted only when WEBHOOK_STORE_PAYLOAD=true (WP1 inspection); WP2 stores it on error only.
 */
export async function recordWebhookEvent(input: {
  shopDomain: string;
  topic: string;
  webhookId: string;
  payload: Record<string, unknown>;
}): Promise<RecordResult> {
  const shop = await prisma.shop.findUnique({ where: { domain: input.shopDomain }, select: { id: true } });
  if (!shop) return "unknown_shop";

  try {
    await prisma.webhookEvent.create({
      data: {
        shopId: shop.id,
        topic: input.topic,
        shopifyId: input.webhookId,
        payload: storeWebhookPayloads ? (stripPii(input.payload) as Prisma.InputJsonObject) : undefined,
      },
    });
    return "created";
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }
}

/** WP1 stubs do no processing, so a created event is complete immediately. */
export async function markProcessed(webhookId: string) {
  await prisma.webhookEvent.updateMany({ where: { shopifyId: webhookId }, data: { processedAt: new Date() } });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
