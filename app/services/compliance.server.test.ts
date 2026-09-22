import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../../test/fixtures/webhooks";

const db = {
  shop: { findUnique: vi.fn(), update: vi.fn() },
  exposure: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  order: { findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  orderAttribution: { deleteMany: vi.fn() },
  refund: { deleteMany: vi.fn() },
  orderLineItem: { deleteMany: vi.fn() },
  reconciliationRun: { deleteMany: vi.fn() },
  webhookEvent: { update: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("../db.server", () => ({ default: db }));
const logAudit = vi.fn();
vi.mock("./audit.server", () => ({ logAudit }));
const { handleCustomerDataRequest, handleCustomerRedact, handleShopRedact } = await import("./compliance.server");

beforeEach(() => {
  for (const model of Object.values(db)) if (typeof model === "object") for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.$transaction.mockReset();
  db.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? arg(db) : Promise.all(arg as Promise<unknown>[])));
  for (const m of [db.orderAttribution, db.refund, db.orderLineItem, db.order, db.exposure, db.reconciliationRun, db.webhookEvent]) m.deleteMany.mockResolvedValue({ count: 2 });
  logAudit.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("customers/data_request", () => {
  it("collects the customer's Exposure and Order rows into WebhookEvent.payload", async () => {
    db.exposure.findMany.mockResolvedValue([{ experimentId: "e1", variantId: "v1", visitorId: "vis", firstSeenAt: new Date("2026-09-01T00:00:00Z"), device: "mobile", country: "DE", referrer: null, utm: null }]);
    db.order.findMany.mockResolvedValue([{ shopifyOrderId: "7612020818204", orderNumber: "#1002", createdAt: new Date("2026-09-22T05:51:40Z"), currency: "USD", totalPrice: "600", financialStatus: "paid", attributions: [], refunds: [] }]);
    const r = await handleCustomerDataRequest("shop1", "ev1", loadFixture("customers-data_request.json"));
    expect(r).toEqual({ exposures: 1, orders: 1 });
    const { where, data } = db.webhookEvent.update.mock.calls[0][0];
    expect(where).toEqual({ id: "ev1" });
    expect(data.payload).toMatchObject({ kind: "customers/data_request", customerId: "10442132062492", requestId: 9999, ordersRequested: [7612020818204] });
    expect(data.payload.exposures[0].visitorId).toBe("vis");
    expect(JSON.stringify(data.payload)).not.toContain("example.com");
    expect(db.exposure.findMany.mock.calls[0][0].where).toEqual({ shopId: "shop1", customerId: "10442132062492" });
  });
});

describe("customers/redact", () => {
  it("nulls customerId on Exposure and Order for that shop", async () => {
    db.exposure.updateMany.mockResolvedValue({ count: 3 });
    db.order.updateMany.mockResolvedValue({ count: 1 });
    expect(await handleCustomerRedact("shop1", loadFixture("customers-redact.json"))).toEqual({ exposures: 3, orders: 1 });
    expect(db.exposure.updateMany).toHaveBeenCalledWith({ where: { shopId: "shop1", customerId: "10442132062492" }, data: { customerId: null } });
    expect(db.order.updateMany).toHaveBeenCalledWith({ where: { shopId: "shop1", customerId: "10442132062492" }, data: { customerId: null } });
  });
});

describe("shop/redact (plan 8.6)", () => {
  const uninstalled = { domain: "s.myshopify.com", status: "UNINSTALLED" };

  it("deletes exactly Order, OrderLineItem, OrderAttribution, Refund, Exposure, WebhookEvent (except this one), ReconciliationRun and the token", async () => {
    db.shop.findUnique.mockResolvedValue(uninstalled);
    const r = await handleShopRedact("shop1", "ev-current");
    expect(r).toEqual({ deleted: { attributions: 2, refunds: 2, lineItems: 2, orders: 2, exposures: 2, reconciliationRuns: 2, webhookEvents: 2 } });
    expect(db.orderAttribution.deleteMany).toHaveBeenCalledWith({ where: { order: { shopId: "shop1" } } });
    expect(db.order.deleteMany).toHaveBeenCalledWith({ where: { shopId: "shop1" } });
    expect(db.exposure.deleteMany).toHaveBeenCalledWith({ where: { shopId: "shop1" } });
    expect(db.reconciliationRun.deleteMany).toHaveBeenCalledWith({ where: { shopId: "shop1" } });
    expect(db.webhookEvent.deleteMany).toHaveBeenCalledWith({ where: { shopId: "shop1", id: { not: "ev-current" } } });
    expect(db.shop.update).toHaveBeenCalledWith({ where: { id: "shop1" }, data: { accessToken: null, session: null } });
    // kept: Shop, Experiment, Variant, AuditLog, ExperimentResult, DailyStat – no delete on the shop row, audit entry written
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop1", action: "UPDATED" }));
  });

  it("skips everything when the shop was reinstalled in the meantime (status no longer UNINSTALLED)", async () => {
    db.shop.findUnique.mockResolvedValue({ ...uninstalled, status: "ACTIVE" });
    expect(await handleShopRedact("shop1", "ev")).toEqual({ skipped: "reinstalled" });
    db.shop.findUnique.mockResolvedValue({ ...uninstalled, status: "PENDING" });
    expect(await handleShopRedact("shop1", "ev")).toEqual({ skipped: "reinstalled" });
    expect(db.order.deleteMany).not.toHaveBeenCalled();
    expect(db.shop.update).not.toHaveBeenCalled();
  });
});
