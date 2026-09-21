import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { Session } from "@shopify/shopify-app-react-router/server";
import type { PrismaClient, Shop, ShopStatus } from "@prisma/client";
import { ShopSessionStorage } from "./session-storage.server";

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");

const DOMAIN = "dev-one.myshopify.com";

// Minimal in-memory stand-in for prisma.shop – only what ShopSessionStorage touches.
function fakeDb(seed?: Partial<Shop>) {
  const rows = new Map<string, Shop>();
  if (seed) rows.set(DOMAIN, row(seed));
  const shop = {
    findUnique: async ({ where }: { where: { domain: string } }) => rows.get(where.domain) ?? null,
    create: async ({ data }: { data: Partial<Shop> }) => {
      const r = row(data);
      rows.set(r.domain, r);
      return r;
    },
    update: async ({ where, data }: { where: { domain: string }; data: Partial<Shop> }) => {
      const r = { ...rows.get(where.domain)!, ...data };
      rows.set(where.domain, r);
      return r;
    },
    updateMany: async ({ where, data }: { where: { domain: string }; data: Partial<Shop> }) => {
      const r = rows.get(where.domain);
      if (r) rows.set(where.domain, { ...r, ...data });
      return { count: r ? 1 : 0 };
    },
  };
  return { db: { shop } as unknown as PrismaClient, rows };
}

function row(p: Partial<Shop>): Shop {
  return {
    id: "id",
    domain: DOMAIN,
    name: "dev-one",
    accessToken: null,
    session: null,
    scope: null,
    status: "PENDING" as ShopStatus,
    requireConsent: false,
    timezone: null,
    installedAt: null,
    activatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  };
}

function offlineSession(token = "shpat_abc") {
  return new Session({
    id: `offline_${DOMAIN}`,
    shop: DOMAIN,
    state: "state",
    isOnline: false,
    scope: "read_orders",
    accessToken: token,
    expires: new Date(Date.now() + 3600_000),
    refreshToken: "shpr_refresh",
    refreshTokenExpires: new Date(Date.now() + 86400_000),
  });
}

describe("ShopSessionStorage", () => {
  let store: ShopSessionStorage;
  let rows: Map<string, Shop>;

  const setup = (seed?: Partial<Shop>) => {
    const f = fakeDb(seed);
    store = new ShopSessionStorage(f.db);
    rows = f.rows;
  };

  beforeEach(() => setup());

  it("first install creates a PENDING shop with encrypted tokens", async () => {
    await store.storeSession(offlineSession());
    const r = rows.get(DOMAIN)!;
    expect(r.status).toBe("PENDING");
    expect(r.installedAt).toBeInstanceOf(Date);
    expect(r.accessToken).not.toContain("shpat_abc");
    expect(r.session).not.toContain("shpat_abc");
    expect(r.session).not.toContain("shpr_refresh");
  });

  it("ALLOWLISTED becomes ACTIVE on install", async () => {
    setup({ status: "ALLOWLISTED" });
    await store.storeSession(offlineSession());
    expect(rows.get(DOMAIN)!.status).toBe("ACTIVE");
    expect(rows.get(DOMAIN)!.activatedAt).toBeInstanceOf(Date);
  });

  it("round-trips a session with refresh token and expiry", async () => {
    const s = offlineSession();
    await store.storeSession(s);
    const loaded = await store.loadSession(s.id);
    expect(loaded?.accessToken).toBe("shpat_abc");
    expect(loaded?.refreshToken).toBe("shpr_refresh");
    expect(loaded?.expires?.getTime()).toBe(s.expires!.getTime());
    expect(loaded?.scope).toBe("read_orders");
    expect(await store.findSessionsByShop(DOMAIN)).toHaveLength(1);
  });

  it("PENDING shop loads its session (no redirect loop on /app)", async () => {
    await store.storeSession(offlineSession());
    expect(rows.get(DOMAIN)!.status).toBe("PENDING");
    expect(await store.loadSession(`offline_${DOMAIN}`)).toBeDefined();
  });

  it("does not load sessions for ALLOWLISTED or UNINSTALLED shops", async () => {
    await store.storeSession(offlineSession());
    rows.set(DOMAIN, { ...rows.get(DOMAIN)!, status: "UNINSTALLED" });
    expect(await store.loadSession(`offline_${DOMAIN}`)).toBeUndefined();
    rows.set(DOMAIN, { ...rows.get(DOMAIN)!, status: "ALLOWLISTED" });
    expect(await store.loadSession(`offline_${DOMAIN}`)).toBeUndefined();
  });

  it("reinstall after uninstall: ACTIVE again if it had been activated, otherwise PENDING", async () => {
    setup({ status: "UNINSTALLED", activatedAt: new Date("2026-01-01") });
    await store.storeSession(offlineSession("shpat_new"));
    expect(rows.get(DOMAIN)!.status).toBe("ACTIVE");
    expect((await store.loadSession(`offline_${DOMAIN}`))?.accessToken).toBe("shpat_new");

    setup({ status: "UNINSTALLED", activatedAt: null });
    await store.storeSession(offlineSession());
    expect(rows.get(DOMAIN)!.status).toBe("PENDING");
  });

  it("token refresh on an ACTIVE shop keeps status and replaces the token", async () => {
    setup({ status: "ALLOWLISTED" });
    await store.storeSession(offlineSession("shpat_1"));
    await store.storeSession(offlineSession("shpat_2"));
    expect(rows.get(DOMAIN)!.status).toBe("ACTIVE");
    expect((await store.loadSession(`offline_${DOMAIN}`))?.accessToken).toBe("shpat_2");
  });

  it("scopes_update path: scope column follows the session", async () => {
    await store.storeSession(offlineSession());
    const s = offlineSession();
    s.scope = "read_orders,write_products";
    await store.storeSession(s);
    expect(rows.get(DOMAIN)!.scope).toBe("read_orders,write_products");
    expect((await store.loadSession(s.id))?.scope).toBe("read_orders,write_products");
  });

  it("deleteSession drops tokens but not the status", async () => {
    setup({ status: "ALLOWLISTED" });
    await store.storeSession(offlineSession());
    await store.deleteSession(`offline_${DOMAIN}`);
    expect(rows.get(DOMAIN)!.status).toBe("ACTIVE");
    expect(rows.get(DOMAIN)!.accessToken).toBeNull();
    expect(await store.loadSession(`offline_${DOMAIN}`)).toBeUndefined();
  });

  it("refuses online sessions and unknown ids", async () => {
    const online = offlineSession();
    online.isOnline = true;
    await expect(store.storeSession(online)).rejects.toThrow(/offline/);
    expect(await store.loadSession("online_x")).toBeUndefined();
  });
});
