import * as Sentry from "@sentry/react-router";
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { isBotUa } from "./bots.server";
import type { ProxyContext } from "./proxy.server";

// Service layer behind /proxy/e, /proxy/link and /proxy/err (contract 4.5). Bodies are validated by hand – an invalid
// body is a log line and "invalid", never an error: the route answers 204 either way.

const SLUG_RE = /^[a-z0-9-]+$/;
const DEVICES = new Set(["mobile", "tablet", "desktop"]);

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);
const slug = (v: unknown): string | null => (typeof v === "string" && v.length <= 64 && SLUG_RE.test(v) ? v : null);
const vidOf = (v: unknown): string | null => (typeof v === "string" && v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v) ? v : null);

export type ExposureBody = {
  e: string;
  variant: string;
  vid: string;
  cid: string | null;
  url: string;
  dev: string;
  ref: string | null;
  utm: Record<string, string> | null;
};

/** `{ v:1, e, var, vid, cid, url, dev, ref, utm, t }` per 4.5 – returns null for anything that does not fit. */
export function parseExposureBody(body: unknown): ExposureBody | null {
  if (!isObject(body) || body.v !== 1) return null;
  const e = slug(body.e);
  const variant = slug(body.var);
  const vid = vidOf(body.vid);
  const url = str(body.url, 2048);
  const dev = typeof body.dev === "string" && DEVICES.has(body.dev) ? body.dev : null;
  if (!e || !variant || !vid || url === null || !dev || typeof body.t !== "number") return null;
  const ref = str(body.ref, 2048);
  let utm: Record<string, string> | null = null;
  if (body.utm !== null && body.utm !== undefined) {
    if (!isObject(body.utm)) return null;
    utm = {};
    // A long campaign name must not cost us the exposure: truncate instead of rejecting.
    for (const [k, v] of Object.entries(body.utm).slice(0, 10)) {
      if (typeof v !== "string") return null;
      utm[k.slice(0, 64)] = v.slice(0, 200);
    }
  }
  const cid = body.cid === null || body.cid === undefined ? null : String(body.cid);
  return { e, variant, vid, cid, url, dev, ref: ref || null, utm };
}

// One log line per unknown (shop, experiment, variant) – the snippet resends on every load while it holds a stale config.
const loggedUnknown = new Set<string>();
const LOGGED_UNKNOWN_MAX = 1000;

export type ExposureResult = "created" | "duplicate" | "ignored" | "invalid";

/**
 * Idempotent on (experimentId, visitorId): createMany + skipDuplicates = ON CONFLICT DO NOTHING. customerId comes from
 * the proxy context only (`logged_in_customer_id`); the body's cid is logged on mismatch and otherwise ignored.
 * country: Shopify forwards no geo header on proxy requests (only X-Forwarded-For/-Host) → null.
 */
export async function recordExposure(ctx: ProxyContext, body: unknown): Promise<ExposureResult> {
  const p = parseExposureBody(body);
  if (!p) {
    console.warn(`[proxy/e] ${ctx.shop.domain}: invalid body ignored`);
    return "invalid";
  }
  if (p.cid !== null && p.cid !== ctx.customerId) {
    console.warn(`[proxy/e] ${ctx.shop.domain}: body cid ${p.cid} ≠ logged_in_customer_id ${ctx.customerId ?? "∅"} – using the proxy value`);
  }
  const experiment = await prisma.experiment.findUnique({
    where: { shopId_key: { shopId: ctx.shop.id, key: p.e } },
    select: { id: true, status: true, variants: { select: { id: true, key: true } } },
  });
  const variant = experiment?.variants.find((v) => v.key === p.variant);
  if (!experiment || experiment.status !== "RUNNING" || !variant) {
    const k = `${ctx.shop.id}:${p.e}:${p.variant}`;
    if (!loggedUnknown.has(k)) {
      if (loggedUnknown.size >= LOGGED_UNKNOWN_MAX) loggedUnknown.clear();
      loggedUnknown.add(k);
      console.warn(`[proxy/e] ${ctx.shop.domain}: ${!experiment ? "unknown experiment" : !variant ? "unknown variant" : experiment.status} ${p.e}:${p.variant} – ignored (logged once)`);
    }
    return "ignored";
  }
  const { count } = await prisma.exposure.createMany({
    data: [
      {
        shopId: ctx.shop.id,
        experimentId: experiment.id,
        variantId: variant.id,
        visitorId: p.vid,
        customerId: ctx.customerId,
        firstSeenAt: new Date(),
        device: p.dev,
        country: null,
        referrer: p.ref,
        utm: p.utm === null ? undefined : (p.utm as Prisma.InputJsonObject),
        isBot: isBotUa(ctx.userAgent),
      },
    ],
    skipDuplicates: true,
  });
  return count === 0 ? "duplicate" : "created";
}

export type LinkResult = "linked" | "no-customer" | "invalid";

/** 4.5 login link: sets customerId on every exposure of this visitor that has none. Never overwrites a different one. */
export async function linkVisitor(ctx: ProxyContext, body: unknown): Promise<LinkResult> {
  if (!ctx.customerId) return "no-customer";
  const vid = isObject(body) && body.v === 1 ? vidOf(body.vid) : null;
  if (!vid) {
    console.warn(`[proxy/link] ${ctx.shop.domain}: invalid body ignored`);
    return "invalid";
  }
  const { count } = await prisma.exposure.updateMany({
    where: { shopId: ctx.shop.id, visitorId: vid, customerId: null },
    data: { customerId: ctx.customerId },
  });
  const other = await prisma.exposure.count({ where: { shopId: ctx.shop.id, visitorId: vid, customerId: { not: ctx.customerId } } });
  if (other > 0) console.warn(`[proxy/link] ${ctx.shop.domain}: visitor ${vid} has ${other} exposure(s) linked to another customer – left untouched`);
  console.log(`[proxy/link] ${ctx.shop.domain}: ${count} exposure(s) linked to customer ${ctx.customerId}`);
  return "linked";
}

// Two throttles, both in memory (single instance, rahmen §9): at most 500 SnippetError rows per shop per rolling hour
// (beyond that only a log line), and one Sentry event per (shop, experiment, message) per 10 minutes.
export const SNIPPET_ERROR_ROWS_PER_HOUR = 500;
export const SENTRY_THROTTLE_MS = 10 * 60 * 1000;
const rowCounter = new Map<string, { count: number; windowStart: number }>();
const sentryLastSent = new Map<string, number>();
const MAP_MAX = 1000;

export function _resetSnippetErrorThrottles() {
  rowCounter.clear();
  sentryLastSent.clear();
}

function underRowCap(shopId: string, now: number): boolean {
  const entry = rowCounter.get(shopId);
  if (!entry || now - entry.windowStart >= 60 * 60 * 1000) {
    if (rowCounter.size >= MAP_MAX) rowCounter.clear();
    rowCounter.set(shopId, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= SNIPPET_ERROR_ROWS_PER_HOUR;
}

function shouldSendToSentry(key: string, now: number): boolean {
  const last = sentryLastSent.get(key);
  if (last !== undefined && now - last < SENTRY_THROTTLE_MS) return false;
  if (sentryLastSent.size >= MAP_MAX) sentryLastSent.clear();
  sentryLastSent.set(key, now);
  return true;
}

export type SnippetErrorResult = "stored" | "stored+sentry" | "capped" | "invalid";

/** `{ v:1, e, var, msg, stack, url }` → SnippetError row + throttled Sentry message with tags. */
export async function recordSnippetError(ctx: ProxyContext, body: unknown, now = Date.now()): Promise<SnippetErrorResult> {
  const e = isObject(body) && body.v === 1 ? slug(body.e) : null;
  const variant = isObject(body) ? slug(body.var) : null;
  const msg = isObject(body) ? str(body.msg, 1000) : null;
  if (!e || !variant || !msg) {
    console.warn(`[proxy/err] ${ctx.shop.domain}: invalid body ignored`);
    return "invalid";
  }
  const stack = str((body as Json).stack, 2000);
  const url = str((body as Json).url, 2048);
  if (!underRowCap(ctx.shop.id, now)) {
    console.warn(`[proxy/err] ${ctx.shop.domain}: row cap reached (${SNIPPET_ERROR_ROWS_PER_HOUR}/h) – ${e}:${variant} ${msg}`);
    return "capped";
  }
  await prisma.snippetError.create({
    data: { shopId: ctx.shop.id, experimentKey: e, variantKey: variant, message: msg, stack: stack || null, url: url || null, userAgent: ctx.userAgent },
  });
  if (!shouldSendToSentry(`${ctx.shop.id}|${e}|${msg}`, now)) return "stored";
  const eventId = Sentry.captureMessage(`snippet error in ${e}:${variant}: ${msg}`, {
    level: "warning",
    tags: { shop: ctx.shop.domain, experiment: e, variant },
    extra: { url, stack },
  });
  console.log(`[proxy/err] ${ctx.shop.domain}: sentry event ${eventId}`);
  return "stored+sentry";
}

// --- Inspection for the dashboard shop page (WP3 3c) – not the results page, no stats here. ---

export type ExposureCount = { experimentKey: string; variantKey: string; visitors: number; bots: number };

export async function listExposureCounts(shopId: string): Promise<ExposureCount[]> {
  const groups = await prisma.exposure.groupBy({ by: ["experimentId", "variantId", "isBot"], where: { shopId }, _count: { _all: true } });
  if (groups.length === 0) return [];
  const variants = await prisma.variant.findMany({
    where: { id: { in: Array.from(new Set(groups.map((g) => g.variantId))) } },
    select: { id: true, key: true, experiment: { select: { key: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const rows = new Map<string, ExposureCount>();
  for (const g of groups) {
    const v = byId.get(g.variantId);
    if (!v) continue;
    const k = `${v.experiment.key}:${v.key}`;
    const row = rows.get(k) ?? { experimentKey: v.experiment.key, variantKey: v.key, visitors: 0, bots: 0 };
    if (g.isBot) row.bots += g._count._all;
    else row.visitors += g._count._all;
    rows.set(k, row);
  }
  return Array.from(rows.values()).sort((a, b) => (a.experimentKey + a.variantKey).localeCompare(b.experimentKey + b.variantKey));
}

export function listRecentSnippetErrors(shopId: string, take = 50) {
  return prisma.snippetError.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take });
}
