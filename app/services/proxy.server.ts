import * as Sentry from "@sentry/react-router";
import { createHmac } from "node:crypto";
import { env } from "../env.server";
import { safeEqual } from "./crypto.server";
import { getShopByDomain } from "./shops.server";

/**
 * App proxy auth for /proxy/* (ADR-0031). Own implementation instead of authenticate.public.appProxy: same algorithm
 * (Dev MCP, docs/apps/build/online-store/app-proxies/authenticate-app-proxies – remove `signature`, `key=value` per param
 * with multi-values joined by ",", sorted, concatenated without separator, HMAC-SHA256 hex with the app secret), but 401
 * instead of 400, a 5-minute timestamp window instead of 90 s, and no offline-session load on the beacon hot path.
 * Cookies never reach us (Shopify strips them) – the customer comes from `logged_in_customer_id`, never from the body.
 */

export const PROXY_MAX_AGE_SEC = 5 * 60;
export const PROXY_MAX_BODY_BYTES = 4096;

export type SignatureResult = "ok" | "missing-signature" | "bad-signature" | "stale";

export function proxySignatureString(params: URLSearchParams): string {
  const keys = Array.from(new Set(Array.from(params.keys()))).filter((k) => k !== "signature").sort();
  return keys.map((k) => `${k}=${params.getAll(k).join(",")}`).join("");
}

export function verifyProxySignature(url: URL, secret: string, nowMs = Date.now()): SignatureResult {
  const params = url.searchParams;
  const given = params.get("signature");
  if (!given) return "missing-signature";
  const expected = createHmac("sha256", secret).update(proxySignatureString(params)).digest("hex");
  if (!safeEqual(given, expected)) return "bad-signature";
  const ts = Number(params.get("timestamp"));
  if (!Number.isFinite(ts) || Math.abs(Math.trunc(nowMs / 1000) - ts) > PROXY_MAX_AGE_SEC) return "stale";
  return "ok";
}

export type ProxyContext = {
  shop: { id: string; domain: string };
  /** From `logged_in_customer_id` only; "" (anonymous) → null. */
  customerId: string | null;
  userAgent: string | null;
};

/**
 * 405 non-POST · 400 no `shop` · 401 bad/missing/stale signature · 204 shop unknown or not ACTIVE (the snippet sets its
 * marker and stops retrying; nothing is stored) · otherwise the context.
 */
export async function authenticateProxy(request: Request): Promise<ProxyContext | Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const domain = url.searchParams.get("shop");
  if (!domain) return new Response("Missing shop", { status: 400 });
  const sig = verifyProxySignature(url, env("SHOPIFY_API_SECRET"));
  if (sig !== "ok") {
    console.warn(`[proxy] ${url.pathname} ${domain} → 401 (${sig})`);
    return new Response("Unauthorized", { status: 401 });
  }
  const shop = await getShopByDomain(domain);
  if (!shop || shop.status !== "ACTIVE") {
    console.log(`[proxy] ${url.pathname} ${domain} → 204 (${shop ? shop.status : "unknown shop"}, nothing stored)`);
    return new Response(null, { status: 204 });
  }
  const cid = url.searchParams.get("logged_in_customer_id");
  return { shop: { id: shop.id, domain: shop.domain }, customerId: cid ? cid : null, userAgent: request.headers.get("user-agent") };
}

/** JSON body ≤ 4 KB, else null. Never throws. */
export async function readJsonBody(request: Request, maxBytes = PROXY_MAX_BODY_BYTES): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type ProxyHandler = (ctx: ProxyContext, body: unknown | null) => Promise<string>;

/**
 * Shared action for the three routes: auth → body → handler. Every accepted request answers 204, including invalid
 * bodies and handler failures (logged + Sentry) – the snippet must never keep retrying garbage. Only auth answers 4xx.
 */
export async function proxyAction(request: Request, handler: ProxyHandler): Promise<Response> {
  const ctx = await authenticateProxy(request);
  if (ctx instanceof Response) return ctx;
  const path = new URL(request.url).pathname;
  const started = Date.now();
  try {
    const summary = await handler(ctx, await readJsonBody(request));
    console.log(`[proxy] ${path} ${ctx.shop.domain} → ${summary} in ${Date.now() - started} ms`);
  } catch (err) {
    console.error(`[proxy] ${path} ${ctx.shop.domain} → FAILED after ${Date.now() - started} ms`, err);
    Sentry.captureException(err, { tags: { route: path }, extra: { shop: ctx.shop.domain } });
  }
  return new Response(null, { status: 204 });
}
