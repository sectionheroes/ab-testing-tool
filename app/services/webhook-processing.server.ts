import { ingestOrderCreate, ingestOrderUpdate, ingestRefund } from "./orders.server";
import { handleCustomerDataRequest, handleCustomerRedact, handleShopRedact } from "./compliance.server";
import { markUninstalled, updateScope } from "./shops.server";

export type WebhookContext = {
  eventId: string;
  shopId: string;
  shopDomain: string;
  topic: string; // normalised, e.g. "orders/create"
  payload: Record<string, unknown>;
};

/**
 * Single dispatcher used by the live handler and by /jobs/retry-webhooks, so a retry runs exactly the same code.
 * Returns a short summary for the log. Throwing = failure → WebhookEvent.error + payload (webhook-handler.server.ts).
 */
export async function processWebhook(ctx: WebhookContext): Promise<string> {
  switch (ctx.topic) {
    case "orders/create": {
      const r = await ingestOrderCreate(ctx.shopId, ctx.payload);
      return `order ${r.orderId}, ${r.attributions} attribution(s)`;
    }
    case "orders/updated":
      return await ingestOrderUpdate(ctx.shopId, ctx.payload);
    case "refunds/create": {
      const r = await ingestRefund(ctx.shopId, ctx.shopDomain, ctx.payload);
      return `refund ${r.refundId} ${r.amount} (${r.method})`;
    }
    case "customers/data_request": {
      const r = await handleCustomerDataRequest(ctx.shopId, ctx.eventId, ctx.payload);
      return `export: ${r.exposures} exposures, ${r.orders} orders`;
    }
    case "customers/redact": {
      const r = await handleCustomerRedact(ctx.shopId, ctx.payload);
      return `unlinked ${r.exposures} exposures, ${r.orders} orders`;
    }
    case "shop/redact": {
      const r = await handleShopRedact(ctx.shopId, ctx.eventId);
      return "skipped" in r ? `skipped (${r.skipped})` : `deleted ${JSON.stringify(r.deleted)}`;
    }
    case "app/uninstalled":
      await markUninstalled(ctx.shopDomain);
      return "uninstalled";
    case "app/scopes_update": {
      const current = ctx.payload.current;
      if (Array.isArray(current)) await updateScope(ctx.shopDomain, current.join(","));
      return "scopes updated";
    }
    default:
      return `no handler for ${ctx.topic} – ignored`;
  }
}

/** customers/data_request keeps its export in payload after success; everything else clears it. */
export function keepsPayloadOnSuccess(topic: string): boolean {
  return topic === "customers/data_request";
}
