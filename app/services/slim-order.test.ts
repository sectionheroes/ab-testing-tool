import { describe, expect, it } from "vitest";
import { RAW_WHITELIST, slimOrder } from "./slim-order";
import { stripPii } from "./pii";
import { loadFixture, orderFixtures } from "../../test/fixtures/webhooks";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every key path in the slim output that is not on the whitelist. */
function offWhitelist(raw: Json): string[] {
  const bad: string[] = [];
  const allowedTop = new Set<string>([...RAW_WHITELIST.scalars, "note_attributes", "line_items", "shipping_lines", "customer"]);
  for (const [k, v] of Object.entries(raw)) {
    if (RAW_WHITELIST.moneySetPattern.test(k)) {
      if (!isObject(v) || Object.keys(v).join() !== "shop_money") bad.push(k);
      continue;
    }
    if (!allowedTop.has(k)) bad.push(k);
  }
  const check = (arr: unknown, allowed: readonly string[], label: string) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((item, i) => {
      if (!isObject(item)) return bad.push(`${label}[${i}]`);
      for (const [k, v] of Object.entries(item)) {
        if (!allowed.includes(k)) bad.push(`${label}[${i}].${k}`);
        if (k.endsWith("_set") && (!isObject(v) || Object.keys(v).join() !== "shop_money")) bad.push(`${label}[${i}].${k}`);
      }
    });
  };
  check(raw.note_attributes, RAW_WHITELIST.noteAttribute, "note_attributes");
  check(raw.line_items, RAW_WHITELIST.lineItem, "line_items");
  check(raw.shipping_lines, RAW_WHITELIST.shippingLine, "shipping_lines");
  if (isObject(raw.customer) && Object.keys(raw.customer).join() !== "id") bad.push("customer");
  return bad;
}

describe("slimOrder", () => {
  describe.each(orderFixtures())("fixture $name", ({ payload }) => {
    const raw = slimOrder(stripPii(payload));
    it("contains no key outside the whitelist (plan §3 / rahmen §3.1)", () => {
      expect(offWhitelist(raw)).toEqual([]);
    });
    it("keeps the money sets as shop_money only – never presentment", () => {
      expect(JSON.stringify(raw)).not.toContain("presentment_money");
      const total = raw.total_price_set as { shop_money: { amount: string; currency_code: string } };
      expect(total.shop_money.amount).toMatch(/^\d+\.\d{2}$/);
      expect(total.shop_money.currency_code).toBe((payload.total_price_set as { shop_money: { currency_code: string } }).shop_money.currency_code);
    });
    it("is well under 5 KB", () => {
      expect(JSON.stringify(raw).length).toBeLessThan(5 * 1024);
    });
  });

  it("keeps what attribution and stats need on the normal order", () => {
    const payload = loadFixture("orders-create.cart-attribute.json");
    const raw = slimOrder(stripPii(payload));
    expect(raw.note_attributes).toEqual([{ name: "_ab", value: "demo-test:b" }]);
    expect(raw.customer).toEqual({ id: 10442132062492 });
    expect(raw.financial_status).toBe("paid");
    expect(raw.cancelled_at).toBeNull();
    const li = (raw.line_items as Json[])[0];
    expect(Object.keys(li).sort()).toEqual(["id", "price", "price_set", "product_id", "properties", "quantity", "variant_id"]);
    expect((raw.shipping_lines as Json[])[0].title).toBe("Standard");
    expect(JSON.stringify(payload).length).toBeGreaterThan(JSON.stringify(raw).length * 2);
  });

  it("keeps the line item property form and drops presentment inside line items", () => {
    const raw = slimOrder(stripPii(loadFixture("orders-create.line-item-property.json")));
    const li = (raw.line_items as Json[])[0];
    expect(li.properties).toEqual([{ name: "_ab", value: "demo-test:a" }]);
    expect(Object.keys(li.price_set as Json)).toEqual(["shop_money"]);
  });
});
