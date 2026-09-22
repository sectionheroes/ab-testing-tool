import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { env } from "../env.server";
import { safeEqual } from "./crypto.server";
import { errorMessage } from "./webhooks.server";
import { keepsPayloadOnSuccess, processWebhook } from "./webhook-processing.server";

export const JOBS_HEADER = "x-jobs-secret";
export const MAX_ATTEMPTS = 5;
export const WEBHOOK_EVENT_RETENTION_DAYS = 30;
const CLEANUP_BATCH = 10_000;

/** POST /jobs/* – Render Cron Jobs (WP6) and manual curl calls send the secret in `X-Jobs-Secret`. */
export function requireJobsSecret(request: Request): Response | null {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const given = request.headers.get(JOBS_HEADER) ?? "";
  if (!given || !safeEqual(given, env("JOBS_SECRET"))) return new Response("Unauthorized", { status: 401 });
  return null;
}

export type RetryResult = { candidates: number; succeeded: number; failed: number; details: { id: string; topic: string; result: string }[] };

/**
 * Re-processes WebhookEvents with error and attempts < 5 through the same dispatcher as the live handler.
 * Success clears error + payload; failure bumps attempts (attempts ≥ 5 → Slack digest, WP6).
 */
export async function retryWebhooks(limit = 200): Promise<RetryResult> {
  const events = await prisma.webhookEvent.findMany({
    where: { error: { not: null }, attempts: { lt: MAX_ATTEMPTS }, payload: { not: Prisma.DbNull } },
    orderBy: { receivedAt: "asc" },
    take: limit,
    include: { shop: { select: { domain: true } } },
  });
  const result: RetryResult = { candidates: events.length, succeeded: 0, failed: 0, details: [] };
  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    try {
      const summary = await processWebhook({ eventId: event.id, shopId: event.shopId, shopDomain: event.shop.domain, topic: event.topic, payload });
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: null, ...(keepsPayloadOnSuccess(event.topic) ? {} : { payload: Prisma.DbNull }) },
      });
      result.succeeded++;
      result.details.push({ id: event.id, topic: event.topic, result: `ok: ${summary}` });
    } catch (err) {
      await prisma.webhookEvent.update({ where: { id: event.id }, data: { error: errorMessage(err), attempts: { increment: 1 } } });
      result.failed++;
      result.details.push({ id: event.id, topic: event.topic, result: `failed: ${errorMessage(err)}` });
    }
  }
  console.log(`[jobs/retry-webhooks] ${result.candidates} candidates, ${result.succeeded} ok, ${result.failed} failed`);
  return result;
}

/**
 * Retention (ADR-0024): WebhookEvent rows older than 30 days go, in batches of 10 000. Exception: customers/data_request
 * events still carrying their export stay until the export is cleared by hand. Exposure retention (12 months) is WP6.
 */
export async function cleanup(now = new Date()): Promise<{ webhookEvents: number }> {
  const cutoff = new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let total = 0;
  for (;;) {
    const batch = await prisma.webhookEvent.findMany({
      where: {
        receivedAt: { lt: cutoff },
        NOT: { topic: "customers/data_request", payload: { not: Prisma.DbNull } },
      },
      select: { id: true },
      take: CLEANUP_BATCH,
    });
    if (batch.length === 0) break;
    const { count } = await prisma.webhookEvent.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
    total += count;
    if (batch.length < CLEANUP_BATCH) break;
  }
  console.log(`[jobs/cleanup] deleted ${total} WebhookEvent rows older than ${cutoff.toISOString()}`);
  return { webhookEvents: total };
}
