import { describe, expect, it, vi, beforeEach } from "vitest";

const create = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();
vi.mock("../db.server", () => ({ default: { shop: { findUnique }, webhookEvent: { create, update } } }));

const { markFailed, markProcessed, normalizeTopic, recordWebhookEvent } = await import("./webhooks.server");

describe("normalizeTopic", () => {
  it("maps the SDK enum form to Shopify's topic string", () => {
    expect(normalizeTopic("ORDERS_CREATE")).toBe("orders/create");
    expect(normalizeTopic("ORDERS_UPDATED")).toBe("orders/updated");
    expect(normalizeTopic("REFUNDS_CREATE")).toBe("refunds/create");
    expect(normalizeTopic("APP_UNINSTALLED")).toBe("app/uninstalled");
    expect(normalizeTopic("APP_SCOPES_UPDATE")).toBe("app/scopes_update");
    expect(normalizeTopic("CUSTOMERS_DATA_REQUEST")).toBe("customers/data_request");
    expect(normalizeTopic("CUSTOMERS_REDACT")).toBe("customers/redact");
    expect(normalizeTopic("SHOP_REDACT")).toBe("shop/redact");
  });
  it("passes normalised topics through unchanged", () => {
    for (const t of ["orders/create", "customers/data_request", "app/scopes_update", "shop/redact"]) expect(normalizeTopic(t)).toBe(t);
  });
  it("matches the SQL in migration 20260922_wp2_data_model for every WP1 topic", () => {
    // lower(regexp_replace(topic, '_', '/')) – first underscore only
    const sql = (t: string) => t.replace("_", "/").toLowerCase();
    for (const t of ["ORDERS_CREATE", "ORDERS_UPDATED", "REFUNDS_CREATE", "APP_UNINSTALLED", "APP_SCOPES_UPDATE", "CUSTOMERS_DATA_REQUEST", "CUSTOMERS_REDACT", "SHOP_REDACT"]) {
      expect(sql(t)).toBe(normalizeTopic(t));
    }
  });
});

describe("recordWebhookEvent", () => {
  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    findUnique.mockReset();
  });

  it("creates the event without payload and with the normalised topic", async () => {
    findUnique.mockResolvedValue({ id: "shop1" });
    create.mockResolvedValue({ id: "ev1" });
    const result = await recordWebhookEvent({ shopDomain: "x.myshopify.com", topic: "ORDERS_CREATE", webhookId: "wh-1" });
    expect(result).toEqual({ result: "created", eventId: "ev1", shopId: "shop1" });
    expect(create).toHaveBeenCalledWith({ data: { shopId: "shop1", topic: "orders/create", shopifyId: "wh-1" }, select: { id: true } });
  });

  it("treats a unique violation on shopifyId as a duplicate delivery", async () => {
    findUnique.mockResolvedValue({ id: "shop1" });
    create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await recordWebhookEvent({ shopDomain: "x.myshopify.com", topic: "t", webhookId: "wh-1" })).toEqual({ result: "duplicate" });
  });

  it("returns unknown_shop when the domain is not in the database", async () => {
    findUnique.mockResolvedValue(null);
    expect(await recordWebhookEvent({ shopDomain: "nope.myshopify.com", topic: "t", webhookId: "wh-2" })).toEqual({ result: "unknown_shop" });
    expect(create).not.toHaveBeenCalled();
  });

  it("markFailed stores error, attempts++ and the PII-stripped body; markProcessed clears payload", async () => {
    update.mockResolvedValue({});
    await markFailed("ev1", new Error("boom"), { id: 1, email: "a@b.de", customer: { id: 5, first_name: "A" } });
    expect(update).toHaveBeenCalledWith({
      where: { id: "ev1" },
      data: { error: "Error: boom", attempts: { increment: 1 }, payload: { id: 1, customer: { id: 5 } } },
    });
    await markProcessed("ev1");
    const call = update.mock.calls[1][0];
    expect(call.data.error).toBeNull();
    expect(call.data.processedAt).toBeInstanceOf(Date);
    expect("payload" in call.data).toBe(true);
    await markProcessed("ev1", true);
    expect("payload" in update.mock.calls[2][0].data).toBe(false);
  });
});
