import { describe, expect, it } from "vitest";
import { findPiiKeys, stripPii } from "./pii";
import { allFixtures, loadFixture } from "../../test/fixtures/webhooks";
import { slimOrder } from "./slim-order";

describe("stripPii", () => {
  it("removes every PII key and reduces customer to its id (unit)", () => {
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
      fulfillments: [{ id: 9, destination: { name: "X" }, tracking_number: "T" }],
      refunds: [{ id: 3, order_adjustments: [], transactions: [{ id: 4, receipt: { billing_address: { x: 1 } } }] }],
      customer: { id: 42, email: "a@b.de", first_name: "A", default_address: { zip: "1" } },
      note_attributes: [{ name: "_ab", value: "k:b" }],
      total_price_set: { shop_money: { amount: "1.00" } },
    });
    expect(out).toEqual({
      id: 1,
      fulfillments: [{ id: 9, tracking_number: "T" }],
      refunds: [{ id: 3, order_adjustments: [], transactions: [{ id: 4, receipt: {} }] }],
      customer: { id: 42 },
      note_attributes: [{ name: "_ab", value: "k:b" }],
      total_price_set: { shop_money: { amount: "1.00" } },
    });
  });

  it("keeps customer null when absent and does not mutate the input", () => {
    const input = { id: 1, customer: null as unknown as Record<string, unknown>, email: "x", nested: { origin_address: { zip: "1" }, ok: 1 } };
    const out = stripPii(input);
    expect(out.customer).toBeNull();
    expect(out.nested).toEqual({ ok: 1 });
    expect(input.email).toBe("x");
    expect((input.nested as { origin_address: unknown }).origin_address).toBeDefined();
  });

  it("the scanner actually detects PII in the full-PII fixture (sanity check for the tests below)", () => {
    const found = findPiiKeys(loadFixture("orders-create.pii-full.json"));
    for (const key of ["email", "contact_email", "phone", "billing_address", "shipping_address", "customer.first_name", "customer.default_address", "client_details", "payment_details", "fulfillments[0].destination"]) {
      expect(found).toContain(key);
    }
    expect(found.some((p) => /latitude$/.test(p))).toBe(true);
    expect(found.some((p) => /zip$/.test(p))).toBe(true);
  });

  describe.each(allFixtures())("fixture $name", ({ payload }) => {
    it("stripPii() output contains no PII key at any depth", () => {
      expect(findPiiKeys(stripPii(payload))).toEqual([]);
    });
    it("stripPii() keeps customer.id when present", () => {
      const customer = payload.customer as { id?: unknown } | null | undefined;
      const out = stripPii(payload);
      if (customer && customer.id !== undefined) expect(out.customer).toEqual({ id: customer.id });
      else if ("customer" in payload) expect(out.customer).toBeNull();
    });
  });

  describe.each(allFixtures().filter((f) => f.name.startsWith("orders-")))("order fixture $name", ({ payload }) => {
    it("slimOrder(stripPii()) contains no PII key either", () => {
      expect(findPiiKeys(slimOrder(stripPii(payload)))).toEqual([]);
    });
  });
});
