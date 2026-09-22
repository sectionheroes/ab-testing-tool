import * as Sentry from "@sentry/react-router";
import { authenticate } from "../shopify.server";
import { markFailed, markProcessed, normalizeTopic, recordWebhookEvent } from "./webhooks.server";
import { keepsPayloadOnSuccess, processWebhook } from "./webhook-processing.server";

/**
 * Every webhook route: verify HMAC (authenticate.webhook throws 401 otherwise), persist the event idempotently
 * (no payload), process inline via processWebhook(), answer 200. There is no queue (plan WP2, ADR-0024):
 * - processing throws → error + attempts++ + stripPii'd payload on the row, still 200 (we retry ourselves via
 *   /jobs/retry-webhooks; a Shopify redelivery would only hit the idempotency check)
 * - recordWebhookEvent itself fails (DB down) → 500 so Shopify retries later
 * Handlers stay well under 2 s. Never nest these routes under app.tsx.
 */
export async function handleWebhook(request: Request): Promise<Response> {
  const { shop, topic: rawTopic, webhookId, payload } = await authenticate.webhook(request);
  const topic = normalizeTopic(rawTopic);
  const body = payload as Record<string, unknown>;

  const rec = await recordWebhookEvent({ shopDomain: shop, topic, webhookId });
  if (rec.result !== "created") {
    console.log(`[webhook] ${topic} ${shop} ${webhookId} → ${rec.result}`);
    return new Response(null, { status: 200 });
  }

  const started = Date.now();
  try {
    const summary = await processWebhook({ eventId: rec.eventId, shopId: rec.shopId, shopDomain: shop, topic, payload: body });
    await markProcessed(rec.eventId, keepsPayloadOnSuccess(topic));
    console.log(`[webhook] ${topic} ${shop} ${webhookId} → ok in ${Date.now() - started} ms: ${summary}`);
  } catch (err) {
    console.error(`[webhook] ${topic} ${shop} ${webhookId} → FAILED after ${Date.now() - started} ms`, err);
    Sentry.captureException(err, { tags: { topic }, extra: { shop, webhookId } });
    await markFailed(rec.eventId, err, body);
  }
  return new Response(null, { status: 200 });
}

