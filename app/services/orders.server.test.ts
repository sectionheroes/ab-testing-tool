import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../../test/fixtures/webhooks";

const graphql = vi.fn();
vi.mock("../shopify.server", () => ({ unauthenticated: { admin: async () => ({ admin: { graphql } }) } }));
const db = {
  order: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  orderLineItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  orderAttribution: { count: vi.fn(), createMany: vi.fn() },
  refund: { upsert: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("../db.server", () => ({ default: db }));
const resolveAttributions = vi.fn();
vi.mock("./attribution.server", () => ({ resolveAttributions }));

const { ingestOrderCreate, ingestOrderUpdate, ingestRefund, lineItemRows, orderFields, refundAmount, refundAmountFromParts } = await import("./orders.server");

beforeEach(() => {
  for (const model of Object.values(db)) if (typeof model === "object") for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.$transaction.mockReset();
  db.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? arg(db) : Promise.all(arg as Promise<unknown>[])));
  graphql.mockReset();
  resolveAttributions.mockReset();
});

describe("orderFields", () => {
  it("takes every amount from *_price_set.shop_money, never total_price (cart-attribute order)", () => {
    const f = orderFields(loadFixture("orders-create.cart-attribute.json"));
    expect(f).toMatchObject({
      shopifyOrderId: "7612020818204",
      orderNumber: "#1002",
      currency: "USD",
      totalPrice: "600.00",
      subtotalPrice: "600.00",
      totalShipping: "0.00",
      totalTax: "0.00",
      totalDiscounts: "0.00",
      shippingTitle: "Standard",
      financialStatus: "paid",
      cancelledAt: null,
      customerId: "10442132062492",
      sourceName: "web",
      isTest: true,
    });
    expect(f.createdAt.toISOString()).toBe("2026-09-22T05:51:40.000Z");
    expect(JSON.stringify(f.raw)).not.toContain("presentment");
  });

  it("refreshes totals after an order edit (orders/updated fixture)", () => {
    const f = orderFields(loadFixture("orders-updated.edit.json"));
    expect(f.totalPrice).toBe("1259.90");
    expect(f.subtotalPrice).toBe("1259.90");
    expect(f.financialStatus).toBe("partially_paid");
    expect(lineItemRows(loadFixture("orders-updated.edit.json"))).toEqual([
      { shopifyLineId: expect.any(String), shopifyVariantId: "54597328437532", shopifyProductId: expect.any(String), quantity: 2, price: "629.95" },
    ]);
  });

  it("multi-currency order: every amount is the shop-currency (USD) value, never presentment (CAD)", () => {
    const payload = loadFixture("orders-create.multi-currency.json");
    expect(payload.currency).toBe("USD");
    expect(payload.presentment_currency).toBe("CAD");
    expect((payload.total_price_set as { presentment_money: { amount: string } }).presentment_money.amount).toBe("855.00");
    const f = orderFields(payload);
    expect(f.currency).toBe("USD");
    expect(f.totalPrice).toBe("610.95");
    expect(f.totalShipping).toBe("30.73");
    // Shopify converts the CAD presentment price back to USD (580,22), so shop_money ≠ the USD catalogue price – that is what we store
    expect(f.subtotalPrice).toBe("580.22");
    expect(lineItemRows(payload)[0].price).toBe("580.22");
    expect(JSON.stringify(f.raw)).not.toContain("855.00");
    expect(JSON.stringify(f.raw)).not.toContain("CAD");
  });

  it("throws on a payload without shop_money so the event is recorded as failed", () => {
    const p = loadFixture("orders-create.no-attribute.json");
    delete p.total_price_set;
    expect(() => orderFields(p)).toThrow(/total_price_set/);
  });
});

describe("ingestOrderCreate", () => {
  it("upserts the order, replaces line items and stores the resolved attributions once", async () => {
    db.order.upsert.mockResolvedValue({ id: "o1" });
    db.orderAttribution.count.mockResolvedValue(0);
    resolveAttributions.mockResolvedValue([{ experimentId: "e1", variantId: "v1", source: "CART_ATTRIBUTE" }]);
    const r = await ingestOrderCreate("shop1", loadFixture("orders-create.cart-attribute.json"));
    expect(r).toEqual({ orderId: "o1", attributions: 1 });
    expect(db.order.upsert.mock.calls[0][0].create.shopId).toBe("shop1");
    expect(db.orderLineItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: "o1" } });
    expect(db.orderLineItem.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(db.orderAttribution.createMany).toHaveBeenCalledWith({ data: [{ orderId: "o1", experimentId: "e1", variantId: "v1", source: "CART_ATTRIBUTE" }], skipDuplicates: true });
    expect(resolveAttributions.mock.calls[0][0]).toMatchObject({ shopId: "shop1", shopifyOrderId: "7612020818204", customerId: "10442132062492" });
  });

  it("never re-attributes an order that already has attributions (redelivery under a new webhook id)", async () => {
    db.order.upsert.mockResolvedValue({ id: "o1" });
    db.orderAttribution.count.mockResolvedValue(1);
    const r = await ingestOrderCreate("shop1", loadFixture("orders-create.cart-attribute.json"));
    expect(r.attributions).toBe(1);
    expect(resolveAttributions).not.toHaveBeenCalled();
  });
});

describe("ingestOrderUpdate", () => {
  it("is a no-op for an order we have not ingested yet", async () => {
    db.order.findUnique.mockResolvedValue(null);
    expect(await ingestOrderUpdate("shop1", loadFixture("orders-updated.edit.json"))).toBe("unknown_order");
    expect(db.order.update).not.toHaveBeenCalled();
  });
  it("refreshes status, cancelledAt and all money fields but never attribution, createdAt, customerId or sourceName", async () => {
    db.order.findUnique.mockResolvedValue({ id: "o1" });
    expect(await ingestOrderUpdate("shop1", loadFixture("orders-updated.edit.json"))).toBe("updated");
    const data = db.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ totalPrice: "1259.90", subtotalPrice: "1259.90", totalShipping: "0.00", totalTax: "0.00", totalDiscounts: "0.00", financialStatus: "partially_paid", cancelledAt: null });
    for (const k of ["createdAt", "customerId", "sourceName", "isTest", "shopifyOrderId"]) expect(k in data).toBe(false);
    expect(resolveAttributions).not.toHaveBeenCalled();
    expect(db.orderLineItem.createMany.mock.calls[0][0].data[0].quantity).toBe(2);
  });
});

describe("refunds", () => {
  const refund = () => loadFixture("refunds-create.json");

  it("real fixture: transactions carry no amount_set → Admin GraphQL totalRefundedSet.shopMoney", async () => {
    graphql.mockResolvedValue({ json: async () => ({ data: { refund: { id: "gid://shopify/Refund/1029841420572", totalRefundedSet: { shopMoney: { amount: "100.0", currencyCode: "USD" } } } } }) });
    expect(await refundAmount("s.myshopify.com", refund())).toEqual({ amount: "100.00", method: "graphql" });
    expect(graphql.mock.calls[0][1]).toEqual({ variables: { id: "gid://shopify/Refund/1029841420572" } });
  });

  it("uses transactions[].amount_set.shop_money when present, without any API call", async () => {
    const p = refund();
    (p.transactions as Record<string, unknown>[])[0].amount_set = { shop_money: { amount: "92.50", currency_code: "USD" }, presentment_money: { amount: "85.00", currency_code: "EUR" } };
    expect(await refundAmount("s.myshopify.com", p)).toEqual({ amount: "92.50", method: "transactions" });
    expect(graphql).not.toHaveBeenCalled();
  });

  it("falls back to sum-of-parts when the API call fails – and gets the custom-amount refund right", async () => {
    graphql.mockRejectedValue(new Error("shop uninstalled"));
    expect(await refundAmount("s.myshopify.com", refund())).toEqual({ amount: "100.00", method: "parts" });
    // items + tax + shipping - adjustments
    expect(
      refundAmountFromParts({
        refund_line_items: [{ subtotal_set: { shop_money: { amount: "89.99" } }, total_tax_set: { shop_money: { amount: "7.20" } } }],
        refund_shipping_lines: [{ subtotal_amount_set: { shop_money: { amount: "5.00" } } }],
        order_adjustments: [{ amount_set: { shop_money: { amount: "-2.19" } }, tax_amount_set: { shop_money: { amount: "0.00" } } }],
      }),
    ).toBe("104.38");
  });

  it("ingestRefund writes a separate Refund row and throws for an unknown order (→ retry)", async () => {
    db.order.findUnique.mockResolvedValue(null);
    await expect(ingestRefund("shop1", "s.myshopify.com", refund())).rejects.toThrow(/not ingested yet/);
    db.order.findUnique.mockResolvedValue({ id: "o1" });
    db.refund.upsert.mockResolvedValue({ id: "r1" });
    graphql.mockResolvedValue({ json: async () => ({ data: { refund: { totalRefundedSet: { shopMoney: { amount: "100.0" } } } } }) });
    expect(await ingestRefund("shop1", "s.myshopify.com", refund())).toEqual({ refundId: "r1", amount: "100.00", method: "graphql" });
    expect(db.refund.upsert.mock.calls[0][0].create).toMatchObject({ orderId: "o1", shopifyRefundId: "1029841420572", amount: "100.00" });
    expect(db.order.update).not.toHaveBeenCalled();
  });
});
