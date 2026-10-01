import type { Prisma, Shop, UserRole } from "@prisma/client";
import prisma from "../db.server";
import { env } from "../env.server";
import { safeEqual } from "./crypto.server";
import { logAudit } from "./audit.server";
import { syncOnActivation } from "./metafields.server";

/** Pass a transaction client so the database tests can run inside a rolled-back transaction (CLAUDE.md). */
export type Db = Prisma.TransactionClient;

export class ShopError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_DOMAIN" | "EXISTS" | "NOT_FOUND" | "BAD_STATUS" | "BAD_CODE" | "RATE_LIMITED" | "FORBIDDEN",
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

/**
 * Who may let a shop into the system. **ADMIN only, and checked here rather than in the route** (ADR-0038): letting a
 * domain in decides which shop may write data into our database, which is a contract question and not an operational
 * one. The CLI (5c) goes through the same functions, so a guard that only lived in the dashboard would be no guard.
 */
export type Actor = { email: string; role: UserRole };

function requireAdminActor(actor: Actor, what: string): void {
  if (actor.role !== "ADMIN") throw new ShopError(`Only an admin can ${what}.`, "FORBIDDEN");
}

export async function allowlistDomain(rawDomain: string, actor: Actor, db: Db = prisma): Promise<Shop> {
  requireAdminActor(actor, "allowlist a domain");
  const domain = normalizeDomain(rawDomain);
  const existing = await db.shop.findUnique({ where: { domain } });
  if (existing) throw new ShopError(`${domain} already exists (${existing.status})`, "EXISTS");
  const shop = await db.shop.create({
    data: { domain, name: domain.replace(".myshopify.com", ""), status: "ALLOWLISTED" },
  });
  await logAudit({ shopId: shop.id, actor: actor.email, action: "CREATED", diff: { status: "ALLOWLISTED" } }, db);
  return shop;
}

/** Dashboard path: an admin approves a PENDING shop. */
export async function activateShop(id: string, actor: Actor, db: Db = prisma): Promise<Shop> {
  requireAdminActor(actor, "activate a shop");
  return activateShopInternal(id, actor.email, db);
}

/**
 * The activation itself, without the role check. Reached two ways: an admin in the dashboard (above) and the merchant
 * typing the activation code on the embedded page (`activateWithCode`). The second one has no dashboard user at all —
 * it is the path the app reviewer uses — so it authenticates with the code instead of a role.
 */
async function activateShopInternal(id: string, actorLabel: string, db: Db = prisma): Promise<Shop> {
  const shop = await db.shop.findUnique({ where: { id } });
  if (!shop) throw new ShopError("Shop not found", "NOT_FOUND");
  if (shop.status !== "PENDING") throw new ShopError(`Shop is ${shop.status}, only PENDING shops can be activated`, "BAD_STATUS");
  const updated = await db.shop.update({
    where: { id },
    data: { status: "ACTIVE", activatedAt: shop.activatedAt ?? new Date() },
  });
  await logAudit({ shopId: id, actor: actorLabel, action: "STATUS_CHANGED", diff: { from: "PENDING", to: "ACTIVE" } }, db);
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
  return activateShopInternal(shop.id, `shopify:${domain}`);
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

/**
 * The Shops page (WP5a): status, how many tests are running, and when reconciliation last ran. All three in one
 * round trip — the page is a list of six rows, not a dashboard, and three queries per row would be three queries too
 * many.
 */
export type ShopOverviewRow = {
  id: string;
  name: string;
  domain: string;
  status: Shop["status"];
  requireConsent: boolean;
  installedAt: Date | null;
  running: number;
  experiments: number;
  reconciliation: { date: Date; status: "OK" | "MISMATCH" } | null;
};

export async function listShopsOverview(db: Db = prisma): Promise<ShopOverviewRow[]> {
  const shops = await db.shop.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: { id: true, name: true, domain: true, status: true, requireConsent: true, installedAt: true },
  });
  if (shops.length === 0) return [];

  const ids = shops.map((s) => s.id);
  const [running, total, recon] = await Promise.all([
    db.experiment.groupBy({ by: ["shopId"], where: { shopId: { in: ids }, status: "RUNNING" }, _count: { _all: true } }),
    db.experiment.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _count: { _all: true } }),
    db.reconciliationRun.findMany({
      where: { shopId: { in: ids } },
      orderBy: { date: "desc" },
      select: { shopId: true, date: true, status: true },
    }),
  ]);

  const runningBy = new Map(running.map((r) => [r.shopId, r._count._all]));
  const totalBy = new Map(total.map((r) => [r.shopId, r._count._all]));
  const reconBy = new Map<string, { date: Date; status: "OK" | "MISMATCH" }>();
  for (const row of recon) if (!reconBy.has(row.shopId)) reconBy.set(row.shopId, { date: row.date, status: row.status });

  return shops.map((s) => ({
    ...s,
    running: runningBy.get(s.id) ?? 0,
    experiments: totalBy.get(s.id) ?? 0,
    reconciliation: reconBy.get(s.id) ?? null,
  }));
}

/** Resolve the `:shop` URL segment of ADR-0038. `all` is a valid value and means the global view. */
export const ALL_SHOPS = "all";

export async function resolveShopParam(param: string | undefined, db: Db = prisma): Promise<Shop | null> {
  if (!param || param === ALL_SHOPS) return null;
  const shop = await db.shop.findUnique({ where: { domain: param } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}
