/**
 * ADR-0038 point 4: allowlisting a domain and approving a PENDING shop are **ADMIN-only, enforced in the service
 * layer**, with a test. This is that test.
 *
 * The point of putting the guard in the service layer rather than the route is that the dashboard is not the only
 * caller: the CLI in 5c and the API go through the same functions, and a check that lives in a route component is a
 * check exactly one client respects.
 *
 * Every case runs inside a rolled-back transaction (CLAUDE.md) – nothing here ever deletes a row.
 */
import { describe, expect, it } from "vitest";
import { inRollback } from "../../test/db/fixture";
import { ShopError, activateShop, allowlistDomain, listShopsOverview, normalizeDomain, resolveShopParam } from "./shops.server";

const ADMIN = { email: "admin@sectionheroes.de", role: "ADMIN" as const };
const MEMBER = { email: "member@sectionheroes.de", role: "MEMBER" as const };
const CLIENT = { email: "client@example.com", role: "CLIENT" as const };

const unique = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

describe("allowlisting is ADMIN-only (ADR-0038)", () => {
  it("rejects a MEMBER and a CLIENT, and writes nothing", async () => {
    await inRollback(async (tx) => {
      const domain = `${unique()}.myshopify.com`;
      for (const actor of [MEMBER, CLIENT]) {
        await expect(allowlistDomain(domain, actor, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      // The role check runs before the create, not after it.
      await expect(tx.shop.findUnique({ where: { domain } })).resolves.toBeNull();
    });
  });

  it("lets an ADMIN through and records who did it", async () => {
    await inRollback(async (tx) => {
      const domain = `${unique()}.myshopify.com`;
      const shop = await allowlistDomain(domain, ADMIN, tx);
      expect(shop).toMatchObject({ domain, status: "ALLOWLISTED" });
      const log = await tx.auditLog.findMany({ where: { shopId: shop.id } });
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ actor: ADMIN.email, action: "CREATED" });
    });
  });

  it("refuses a domain that already exists", async () => {
    await inRollback(async (tx) => {
      const domain = `${unique()}.myshopify.com`;
      await allowlistDomain(domain, ADMIN, tx);
      await expect(allowlistDomain(domain, ADMIN, tx)).rejects.toMatchObject({ code: "EXISTS" });
    });
  });
});

describe("approving a PENDING shop is ADMIN-only (ADR-0038)", () => {
  it("rejects a MEMBER and leaves the shop PENDING", async () => {
    await inRollback(async (tx) => {
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Pending", status: "PENDING" } });
      await expect(activateShop(shop.id, MEMBER, tx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(tx.shop.findUnique({ where: { id: shop.id } })).resolves.toMatchObject({ status: "PENDING" });
    });
  });

  it("an ADMIN activates it, with an audit entry", async () => {
    await inRollback(async (tx) => {
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Pending", status: "PENDING" } });
      const activated = await activateShop(shop.id, ADMIN, tx);
      expect(activated.status).toBe("ACTIVE");
      expect(activated.activatedAt).not.toBeNull();
      const log = await tx.auditLog.findMany({ where: { shopId: shop.id, action: "STATUS_CHANGED" } });
      expect(log[0]).toMatchObject({ actor: ADMIN.email });
    });
  });

  it("only a PENDING shop can be activated", async () => {
    await inRollback(async (tx) => {
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Active", status: "ACTIVE" } });
      await expect(activateShop(shop.id, ADMIN, tx)).rejects.toMatchObject({ code: "BAD_STATUS" });
    });
  });
});

describe("normalizeDomain", () => {
  it("accepts the three spellings people actually paste", () => {
    expect(normalizeDomain("kunde")).toBe("kunde.myshopify.com");
    expect(normalizeDomain("kunde.myshopify.com")).toBe("kunde.myshopify.com");
    expect(normalizeDomain("https://kunde.myshopify.com/admin")).toBe("kunde.myshopify.com");
  });

  it("refuses anything that is not a myshopify domain", () => {
    expect(() => normalizeDomain("kunde.de")).toThrow(ShopError);
  });
});

describe("listShopsOverview", () => {
  it("counts running tests and carries the last reconciliation", async () => {
    await inRollback(async (tx) => {
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Overview", status: "ACTIVE" } });
      for (const [key, status] of [
        ["a", "RUNNING"],
        ["b", "RUNNING"],
        ["c", "DRAFT"],
      ] as const) {
        await tx.experiment.create({
          data: { shopId: shop.id, key, name: key, status, salt: "x", targeting: {}, trigger: { type: "immediate" } },
        });
      }
      for (const [date, status] of [
        ["2026-09-29T00:00:00Z", "MISMATCH"],
        ["2026-09-30T00:00:00Z", "OK"],
      ] as const) {
        await tx.reconciliationRun.create({
          data: {
            shopId: shop.id,
            date: new Date(date),
            ourOrderCount: 10,
            shopifyOrderCount: 10,
            ourRevenue: "100.00",
            shopifyRevenue: "100.00",
            status,
          },
        });
      }

      const row = (await listShopsOverview(tx)).find((s) => s.id === shop.id);
      expect(row).toBeDefined();
      expect(row).toMatchObject({ running: 2, experiments: 3 });
      // The *last* run, not the first one it happens to read.
      expect(row!.reconciliation?.status).toBe("OK");
      expect(row!.reconciliation?.date.toISOString()).toBe("2026-09-30T00:00:00.000Z");
    });
  });
});

describe("resolveShopParam (ADR-0038: `all` is a value, not a missing shop)", () => {
  it("returns null for `all` and for nothing", async () => {
    await inRollback(async (tx) => {
      await expect(resolveShopParam("all", tx)).resolves.toBeNull();
      await expect(resolveShopParam(undefined, tx)).resolves.toBeNull();
    });
  });

  it("finds a shop by its domain and 404s on one that does not exist", async () => {
    await inRollback(async (tx) => {
      const shop = await tx.shop.create({ data: { domain: `${unique()}.myshopify.com`, name: "Found", status: "ACTIVE" } });
      await expect(resolveShopParam(shop.domain, tx)).resolves.toMatchObject({ id: shop.id });
      await expect(resolveShopParam("nope.myshopify.com", tx)).rejects.toBeInstanceOf(Response);
    });
  });
});
