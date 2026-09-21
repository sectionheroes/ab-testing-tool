import { describe, expect, it, vi, beforeEach } from "vitest";

const create = vi.fn();
const findUnique = vi.fn();
vi.mock("../db.server", () => ({ default: { shop: { findUnique }, webhookEvent: { create } } }));
vi.mock("../env.server", () => ({ storeWebhookPayloads: true }));

const { recordWebhookEvent, stripPii } = await import("./webhooks.server");

describe("stripPii", () => {
  it("removes every PII key and reduces customer to its id", () => {
    const out = stripPii({
      id: 1,
      email: "a@b.de",
      contact_email: "a@b.de",
      phone: "+49",
      note: "ring twice",
      browser_ip: "1.2.3.4",
      client_details: { browser_ip: "1.2.3.4" },
      payment_details: { credit_card_bin: "1" },
      billing_address: { name: "X" },
      shipping_address: { name: "X" },
      fulfillments: [{ destination: { name: "X" } }],
      customer: { id: 42, email: "a@b.de", first_name: "A" },
      note_attributes: [{ name: "_ab", value: "k:b" }],
      total_price_set: { shop_money: { amount: "1.00" } },
    });
    expect(out).toEqual({
      id: 1,
      customer: { id: 42 },
      note_attributes: [{ name: "_ab", value: "k:b" }],
      total_price_set: { shop_money: { amount: "1.00" } },
    });
  });

  it("keeps customer null when absent and does not mutate the input", () => {
    const input = { id: 1, customer: null as unknown as Record<string, unknown>, email: "x" };
    const out = stripPii(input);
    expect(out.customer).toBeNull();
    expect(input.email).toBe("x");
  });
});

describe("recordWebhookEvent", () => {
  beforeEach(() => {
    create.mockReset();
    findUnique.mockReset();
  });

  it("creates the event with a stripped payload", async () => {
    findUnique.mockResolvedValue({ id: "shop1" });
    create.mockResolvedValue({});
    const result = await recordWebhookEvent({
      shopDomain: "x.myshopify.com",
      topic: "orders/create",
      webhookId: "wh-1",
      payload: { id: 1, email: "a@b.de" },
    });
    expect(result).toBe("created");
    expect(create).toHaveBeenCalledWith({
      data: { shopId: "shop1", topic: "orders/create", shopifyId: "wh-1", payload: { id: 1 } },
    });
  });

  it("treats a unique violation on shopifyId as a duplicate delivery", async () => {
    findUnique.mockResolvedValue({ id: "shop1" });
    create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await recordWebhookEvent({ shopDomain: "x.myshopify.com", topic: "t", webhookId: "wh-1", payload: {} })).toBe("duplicate");
  });

  it("returns unknown_shop when the domain is not in the database", async () => {
    findUnique.mockResolvedValue(null);
    expect(await recordWebhookEvent({ shopDomain: "nope.myshopify.com", topic: "t", webhookId: "wh-2", payload: {} })).toBe("unknown_shop");
    expect(create).not.toHaveBeenCalled();
  });
});
