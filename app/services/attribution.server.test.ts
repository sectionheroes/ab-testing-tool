import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../../test/fixtures/webhooks";

const db = { experiment: { findMany: vi.fn() }, exposure: { findMany: vi.fn() } };
vi.mock("../db.server", () => ({ default: db }));
const { resolveAttributions } = await import("./attribution.server");

const experiments = [{ id: "e1", key: "demo-test", variants: [{ id: "va", key: "a" }, { id: "vb", key: "b" }] }];
/** The `_ab_v` in both order fixtures (contract 4.1b). */
const VID = "44f15d3c-6f0a-4b1e-9f7c-2a1b8e0d5c31";
const base = { shopId: "shop1", shopifyOrderId: "1", orderCreatedAt: new Date("2026-09-22T05:51:40Z"), customerId: "c1" as string | null };

beforeEach(() => {
  db.experiment.findMany.mockReset();
  db.exposure.findMany.mockReset();
  db.experiment.findMany.mockResolvedValue(experiments);
});

describe("resolveAttributions (contract 4.1 order)", () => {
  it("cart attribute → CART_ATTRIBUTE", async () => {
    const r = await resolveAttributions({ ...base, payload: loadFixture("orders-create.cart-attribute.json") });
    expect(r).toEqual([{ experimentId: "e1", variantId: "vb", visitorId: VID, source: "CART_ATTRIBUTE" }]);
    expect(db.exposure.findMany).not.toHaveBeenCalled();
  });
  it("line item property → LINE_ITEM_PROPERTY", async () => {
    const r = await resolveAttributions({ ...base, payload: loadFixture("orders-create.line-item-property.json") });
    expect(r).toEqual([{ experimentId: "e1", variantId: "va", visitorId: VID, source: "LINE_ITEM_PROPERTY" }]);
  });
  it("no attribute + customer → CUSTOMER_LOOKUP over experiments running at order time (not status)", async () => {
    db.exposure.findMany.mockResolvedValue([
      { experimentId: "e1", variantId: "vb" },
      { experimentId: "e1", variantId: "va" }, // older exposure for the same experiment – ignored
      { experimentId: "e2", variantId: "vx" },
    ]);
    const r = await resolveAttributions({ ...base, payload: loadFixture("orders-create.no-attribute.json") });
    // The CUSTOMER_LOOKUP path never has an `_ab_v`: the order never touched a cart of ours (4.1b).
    expect(r).toEqual([
      { experimentId: "e1", variantId: "vb", visitorId: null, source: "CUSTOMER_LOOKUP" },
      { experimentId: "e2", variantId: "vx", visitorId: null, source: "CUSTOMER_LOOKUP" },
    ]);
    const where = db.exposure.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      shopId: "shop1",
      customerId: "c1",
      firstSeenAt: { lte: base.orderCreatedAt },
      experiment: { startedAt: { lte: base.orderCreatedAt }, OR: [{ endedAt: null }, { endedAt: { gte: base.orderCreatedAt } }] },
    });
    expect(JSON.stringify(where)).not.toContain("RUNNING");
  });
  it("no attribute and no customer → nothing", async () => {
    expect(await resolveAttributions({ ...base, customerId: null, payload: loadFixture("orders-create.no-attribute.json") })).toEqual([]);
    expect(db.exposure.findMany).not.toHaveBeenCalled();
  });
  it("the same `_ab_v` goes on every attribution row of the order – it identifies the visitor, not the test", async () => {
    db.experiment.findMany.mockResolvedValue([
      { id: "e1", key: "demo-test", variants: [{ id: "vb", key: "b" }] },
      { id: "e2", key: "other-test", variants: [{ id: "vx", key: "a" }] },
    ]);
    const payload = {
      note_attributes: [
        { name: "_ab", value: "demo-test:b,other-test:a" },
        { name: "_ab_v", value: VID },
      ],
    };
    const r = await resolveAttributions({ ...base, payload });
    expect(r).toEqual([
      { experimentId: "e1", variantId: "vb", visitorId: VID, source: "CART_ATTRIBUTE" },
      { experimentId: "e2", variantId: "vx", visitorId: VID, source: "CART_ATTRIBUTE" },
    ]);
  });

  it("keeps the attribution and warns when `_ab` is there but `_ab_v` is not (ADR-0032 fallback)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await resolveAttributions({ ...base, payload: { note_attributes: [{ name: "_ab", value: "demo-test:b" }] } });
    expect(r).toEqual([{ experimentId: "e1", variantId: "vb", visitorId: null, source: "CART_ATTRIBUTE" }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no valid _ab_v"));
    warn.mockRestore();
  });

  it("drops an `_ab_v` that is not a UUID v4 rather than storing a phantom visitor (4.1b)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of ["not-a-uuid", "", "11111111-1111-1111-1111-111111111111", `${VID} `.repeat(2), "44f15d3c6f0a4b1e9f7c2a1b8e0d5c31"]) {
      const r = await resolveAttributions({
        ...base,
        payload: {
          note_attributes: [
            { name: "_ab", value: "demo-test:b" },
            { name: "_ab_v", value: bad },
          ],
        },
      });
      expect(r).toEqual([{ experimentId: "e1", variantId: "vb", visitorId: null, source: "CART_ATTRIBUTE" }]);
    }
    warn.mockRestore();
  });

  it("reads `_ab_v` from a line item property when the cart attribute has none (Buy Now)", async () => {
    const r = await resolveAttributions({
      ...base,
      payload: {
        note_attributes: [{ name: "_ab", value: "demo-test:b" }],
        line_items: [{ properties: [{ name: "_ab_v", value: VID }] }],
      },
    });
    expect(r).toEqual([{ experimentId: "e1", variantId: "vb", visitorId: VID, source: "CART_ATTRIBUTE" }]);
  });

  it("takes `_ab_v` even when `_ab` came from a line item and `_ab_v` from the cart – the two are independent (4.1b)", async () => {
    const r = await resolveAttributions({
      ...base,
      payload: {
        note_attributes: [{ name: "_ab_v", value: VID }],
        line_items: [{ properties: [{ name: "_ab", value: "demo-test:a" }] }],
      },
    });
    expect(r).toEqual([{ experimentId: "e1", variantId: "va", visitorId: VID, source: "LINE_ITEM_PROPERTY" }]);
  });

  it("unknown experiment / variant keys are ignored and logged, known ones kept", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = { note_attributes: [{ name: "_ab", value: "demo-test:b,ghost:a,demo-test:zz" }] };
    expect(await resolveAttributions({ ...base, payload })).toEqual([
      { experimentId: "e1", variantId: "vb", visitorId: null, source: "CART_ATTRIBUTE" },
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown experiment key ghost:a"));
    const bad = await resolveAttributions({ ...base, payload: { note_attributes: [{ name: "_ab", value: "Not Valid" }] } });
    expect(bad).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("does not match contract 4.1"));
    warn.mockRestore();
  });
});
