import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { env } from "../env.server";
import { safeEqual } from "./crypto.server";
import { logAudit } from "./audit.server";
import { syncOnActivation } from "./metafields.server";

export class ShopError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_DOMAIN" | "EXISTS" | "NOT_FOUND" | "BAD_STATUS" | "BAD_CODE" | "RATE_LIMITED",
  ) {
    super(message);
  }
}

/** Accepts "kunde", "kunde.myshopify.com", "https://kunde.myshopify.com/" → "kunde.myshopify.com". */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d)) {
    throw new ShopError("Enter a myshopify.com domain, e.g. store.myshopify.com", "INVALID_DOMAIN");
  }
  return d;
}

export function listShops() {
  return prisma.shop.findMany({ orderBy: [{ status: "asc" }, { domain: "asc" }] });
}

export function getShop(id: string) {
  return prisma.shop.findUnique({ where: { id } });
}

export function getShopByDomain(domain: string) {
  return prisma.shop.findUnique({ where: { domain } });
}

export async function allowlistDomain(rawDomain: string, actor: string): Promise<Shop> {
  const domain = normalizeDomain(rawDomain);
  const existing = await prisma.shop.findUnique({ where: { domain } });
  if (existing) throw new ShopError(`${domain} already exists (${existing.status})`, "EXISTS");
  const shop = await prisma.shop.create({
    data: { domain, name: domain.replace(".myshopify.com", ""), status: "ALLOWLISTED" },
  });
  await logAudit({ shopId: shop.id, actor, action: "CREATED", diff: { status: "ALLOWLISTED" } });
  return shop;
}

export async function activateShop(id: string, actor: string): Promise<Shop> {
  const shop = await prisma.shop.findUnique({ where: { id } });
  if (!shop) throw new ShopError("Shop not found", "NOT_FOUND");
  if (shop.status !== "PENDING") throw new ShopError(`Shop is ${shop.status}, only PENDING shops can be activated`, "BAD_STATUS");
  const updated = await prisma.shop.update({
    where: { id },
    data: { status: "ACTIVE", activatedAt: shop.activatedAt ?? new Date() },
  });
  await logAudit({ shopId: id, actor, action: "STATUS_CHANGED", diff: { from: "PENDING", to: "ACTIVE" } });
  await syncOnActivation(id); // first config write happens here – never for a PENDING shop
  return updated;
}

// Activation-code attempts per shop; one instance (rahmen §9), so in-memory is enough.
const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function _resetRateLimit() {
  attempts.clear();
}

export async function activateWithCode(domain: string, code: string): Promise<Shop> {
  const now = Date.now();
  const entry = attempts.get(domain);
  if (entry && entry.resetAt > now && entry.count >= ATTEMPT_LIMIT) {
    throw new ShopError("Too many attempts. Try again in 15 minutes.", "RATE_LIMITED");
  }
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) throw new ShopError("Shop not found", "NOT_FOUND");
  if (shop.status !== "PENDING") throw new ShopError(`Shop is ${shop.status}`, "BAD_STATUS");

  if (!code || !safeEqual(code.trim(), env("ACTIVATION_CODE"))) {
    const next = entry && entry.resetAt > now ? { count: entry.count + 1, resetAt: entry.resetAt } : { count: 1, resetAt: now + ATTEMPT_WINDOW_MS };
    attempts.set(domain, next);
    throw new ShopError("That activation code is not valid.", "BAD_CODE");
  }
  attempts.delete(domain);
  return activateShop(shop.id, `shopify:${domain}`);
}

/** app/uninstalled: keep the row (experiments, audit log), drop every token. */
export async function markUninstalled(domain: string): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop || shop.status === "UNINSTALLED") return;
  await prisma.shop.update({
    where: { domain },
    data: { status: "UNINSTALLED", accessToken: null, session: null },
  });
  await logAudit({ shopId: shop.id, actor: `shopify:${domain}`, action: "STATUS_CHANGED", diff: { from: shop.status, to: "UNINSTALLED" } });
}

/** app/scopes_update */
export async function updateScope(domain: string, scope: string): Promise<void> {
  await prisma.shop.updateMany({ where: { domain }, data: { scope } });
}

/** Called from hooks.afterAuth with data from the Admin API. */
export async function recordInstallDetails(domain: string, details: { name: string; timezone: string }): Promise<void> {
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return;
  await prisma.shop.update({
    where: { domain },
    data: {
      name: details.name || shop.name,
      timezone: details.timezone,
      installedAt: shop.installedAt ?? new Date(),
    },
  });
}

/** Theme editor deep link that activates our app embed. Block handle is fixed to `embed` = extensions/sh-ab-embed/blocks/embed.liquid (WP3 must match). */
export const APP_EMBED_HANDLE = "embed";

export function appEmbedDeepLink(domain: string): string {
  const store = domain.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${store}/themes/current/editor?context=apps&activateAppId=${env("SHOPIFY_API_KEY")}/${APP_EMBED_HANDLE}`;
}
