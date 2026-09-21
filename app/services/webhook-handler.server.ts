import { authenticate } from "../shopify.server";
import { markProcessed, recordWebhookEvent } from "./webhooks.server";

/**
 * Shared WP1 stub: verify HMAC (authenticate.webhook throws 401 otherwise), persist the event idempotently,
 * run the optional side effect, answer 200. Never nest these routes under app.tsx.
 */
export async function handleWebhookStub(
  request: Request,
  sideEffect?: (ctx: { shop: string; payload: Record<string, unknown> }) => Promise<void>,
): Promise<Response> {
  const { shop, topic, webhookId, payload } = await authenticate.webhook(request);
  const result = await recordWebhookEvent({ shopDomain: shop, topic, webhookId, payload: payload as Record<string, unknown> });
  console.log(`[webhook] ${topic} ${shop} ${webhookId} → ${result}`);
  if (result === "created") {
    if (sideEffect) await sideEffect({ shop, payload: payload as Record<string, unknown> });
    await markProcessed(webhookId);
  }
  return new Response(null, { status: 200 });
}
