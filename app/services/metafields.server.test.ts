import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { shop: { findUnique: vi.fn() } };
vi.mock("../db.server", () => ({ default: db }));
const graphql = vi.fn();
vi.mock("../shopify.server", () => ({ unauthenticated: { admin: vi.fn(async () => ({ admin: { graphql } })) } }));
const { syncShopConfig, ensureServerConfig, MetafieldWriteError, CONFIG_NAMESPACE } = await import("./metafields.server");

const respond = (data: unknown) => ({ json: async () => ({ data }) });
const shop = (status: string, experiments: unknown[] = []) => ({ id: "shop1", domain: "s.myshopify.com", status, requireConsent: false, experiments });
const running = {
  key: "demo-test",
  status: "RUNNING",
  allocation: 1,
  salt: "abc",
  targeting: {},
  trigger: { type: "immediate" },
  hideUntilApplied: false,
  variants: [{ key: "a", weight: 0.5, js: null, css: null }],
};

beforeEach(() => {
  db.shop.findUnique.mockReset();
  graphql.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("syncShopConfig", () => {
  it("never writes for a shop that is not ACTIVE", async () => {
    for (const status of ["PENDING", "ALLOWLISTED", "UNINSTALLED"]) {
      db.shop.findUnique.mockResolvedValue(shop(status, [running]));
      expect(await syncShopConfig("shop1")).toEqual({ skipped: true, reason: `shop is ${status}` });
    }
    expect(graphql).not.toHaveBeenCalled();
  });

  it("writes the built config as json to the app installation and logs the size", async () => {
    db.shop.findUnique.mockResolvedValue(shop("ACTIVE", [running]));
    graphql
      .mockResolvedValueOnce(respond({ currentAppInstallation: { id: "gid://shopify/AppInstallation/1" } }))
      .mockResolvedValueOnce(respond({ metafieldsSet: { metafields: [{ updatedAt: "2026-09-22T10:00:00Z" }], userErrors: [] } }));
    const r = await syncShopConfig("shop1");
    expect(r.skipped).toBe(false);
    const input = graphql.mock.calls[1][1].variables.metafields[0];
    expect(input).toMatchObject({ ownerId: "gid://shopify/AppInstallation/1", namespace: CONFIG_NAMESPACE, key: "client", type: "json" });
    const value = JSON.parse(input.value);
    expect(value.experiments.map((e: { key: string }) => e.key)).toEqual(["demo-test"]);
    if (!r.skipped) expect(r.bytes).toBe(Buffer.byteLength(input.value));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/s\.myshopify\.com .*client: \d+ B \(\d+\.\d% of 131072\), 1 experiment/));
  });

  it("throws on userErrors", async () => {
    db.shop.findUnique.mockResolvedValue(shop("ACTIVE"));
    graphql
      .mockResolvedValueOnce(respond({ currentAppInstallation: { id: "gid://shopify/AppInstallation/1" } }))
      .mockResolvedValueOnce(respond({ metafieldsSet: { metafields: null, userErrors: [{ field: ["value"], message: "too big", code: "INVALID_VALUE" }] } }));
    await expect(syncShopConfig("shop1")).rejects.toThrow(MetafieldWriteError);
  });
});

describe("ensureServerConfig", () => {
  it("writes { v: 1, experiments: {} } once and leaves an existing value alone", async () => {
    db.shop.findUnique.mockResolvedValue(shop("ACTIVE"));
    graphql
      .mockResolvedValueOnce(respond({ currentAppInstallation: { id: "x", metafield: null } }))
      .mockResolvedValueOnce(respond({ currentAppInstallation: { id: "gid://shopify/AppInstallation/1" } }))
      .mockResolvedValueOnce(respond({ metafieldsSet: { metafields: [{ updatedAt: "t" }], userErrors: [] } }));
    expect(await ensureServerConfig("shop1")).toEqual({ written: true });
    expect(graphql.mock.calls[2][1].variables.metafields[0]).toMatchObject({ key: "server", type: "json", value: '{"v":1,"experiments":{}}' });

    graphql.mockReset();
    graphql.mockResolvedValueOnce(respond({ currentAppInstallation: { id: "x", metafield: { value: '{"v":1,"experiments":{"a":{}}}', updatedAt: "t" } } }));
    expect(await ensureServerConfig("shop1")).toEqual({ written: false });
    expect(graphql).toHaveBeenCalledTimes(1);
  });
});
