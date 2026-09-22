import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../../test/fixtures/webhooks";

const db = { experiment: { findMany: vi.fn() }, exposure: { findMany: vi.fn() } };
vi.mock("../db.server", () => ({ default: db }));
const { resolveAttributions } = await import("./attribution.server");

const experiments = [{ id: "e1", key: "demo-test", variants: [{ id: "va", key: "a" }, { id: "vb", key: "b" }] }];
const base = { shopId: "shop1", shopifyOrderId: "1", orderCreatedAt: new Date("2026-09-22T05:51:40Z"), customerId: "c1" as string | null };

beforeEach(() => {
  db.experiment.findMany.mockReset();
  db.exposure.findMany.mockReset();
  db.experiment.findMany.mockResolvedValue(experiments);
});

describe("resolveAttributions (contract 4.1 order)", () => {
  it("cart attribute → CART_ATTRIBUTE", async () => {
    const r = await resolveAttributions({ ...base, payload: loadFixture("orders-create.cart-attribute.json") });
    expect(r).toEqual([{ experimentId: "e1", variantId: "vb", source: "CART_ATTRIBUTE" }]);
    expect(db.exposure.findMany).not.toHaveBeenCalled();
  });
  it("line item property → LINE_ITEM_PROPERTY", async () => {
    const r = await resolveAttributions({ ...base, payload: loadFixture("orders-create.line-item-property.json") });
    expect(r).toEqual([{ experimentId: "e1", variantId: "va", source: "LINE_ITEM_PROPERTY" }]);
  });
  it("no attribute + customer → CUSTOMER_LOOKUP over experiments running at order time (not status)", async () => {
    db.exposure.findMany.mockResolvedValue([
      { experimentId: "e1", variantId: "vb" },
      { experimentId: "e1", variantId: "va" }, // older exposure for the same experiment – ignored
      { experimentId: "e2", variantId: "vx" },
    ]);
    const r = await resolveAttributions({ ...base, payload: loadFixture("orders-create.no-attribute.json") });
    expect(r).toEqual([
      { experimentId: "e1", variantId: "vb", source: "CUSTOMER_LOOKUP" },
      { experimentId: "e2", variantId: "vx", source: "CUSTOMER_LOOKUP" },
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
  it("unknown experiment / variant keys are ignored and logged, known ones kept", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = { note_attributes: [{ name: "_ab", value: "demo-test:b,ghost:a,demo-test:zz" }] };
    expect(await resolveAttributions({ ...base, payload })).toEqual([{ experimentId: "e1", variantId: "vb", source: "CART_ATTRIBUTE" }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown experiment key ghost:a"));
    const bad = await resolveAttributions({ ...base, payload: { note_attributes: [{ name: "_ab", value: "Not Valid" }] } });
    expect(bad).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("does not match contract 4.1"));
    warn.mockRestore();
  });
});
