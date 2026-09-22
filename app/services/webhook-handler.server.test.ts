import { beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.fn();
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));
const recordWebhookEvent = vi.fn();
const markProcessed = vi.fn();
const markFailed = vi.fn();
vi.mock("./webhooks.server", async (importOriginal) => ({ ...(await importOriginal<object>()), recordWebhookEvent, markProcessed, markFailed }));
const processWebhook = vi.fn();
vi.mock("./webhook-processing.server", () => ({ processWebhook, keepsPayloadOnSuccess: (t: string) => t === "customers/data_request" }));
vi.mock("@sentry/react-router", () => ({ captureException: vi.fn() }));
const { handleWebhook } = await import("./webhook-handler.server");

const req = () => new Request("http://x/webhooks/orders/create", { method: "POST" });

beforeEach(() => {
  for (const fn of [webhook, recordWebhookEvent, markProcessed, markFailed, processWebhook]) fn.mockReset();
  webhook.mockResolvedValue({ shop: "s.myshopify.com", topic: "ORDERS_CREATE", webhookId: "wh-1", payload: { id: 1, email: "a@b.de" } });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleWebhook", () => {
  it("records (normalised topic) → processes inline → marks processed → 200", async () => {
    recordWebhookEvent.mockResolvedValue({ result: "created", eventId: "ev1", shopId: "shop1" });
    processWebhook.mockResolvedValue("done");
    const res = await handleWebhook(req());
    expect(res.status).toBe(200);
    expect(recordWebhookEvent).toHaveBeenCalledWith({ shopDomain: "s.myshopify.com", topic: "orders/create", webhookId: "wh-1" });
    expect(processWebhook).toHaveBeenCalledWith({ eventId: "ev1", shopId: "shop1", shopDomain: "s.myshopify.com", topic: "orders/create", payload: { id: 1, email: "a@b.de" } });
    expect(markProcessed).toHaveBeenCalledWith("ev1", false);
  });

  it("duplicate delivery → 200 without processing", async () => {
    recordWebhookEvent.mockResolvedValue({ result: "duplicate" });
    expect((await handleWebhook(req())).status).toBe(200);
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it("processing error → markFailed with the body, still 200 (we retry ourselves)", async () => {
    recordWebhookEvent.mockResolvedValue({ result: "created", eventId: "ev1", shopId: "shop1" });
    processWebhook.mockRejectedValue(new Error("boom"));
    expect((await handleWebhook(req())).status).toBe(200);
    expect(markFailed).toHaveBeenCalledWith("ev1", expect.any(Error), { id: 1, email: "a@b.de" });
    expect(markProcessed).not.toHaveBeenCalled();
  });

  it("recordWebhookEvent failure (DB down) → throws → 500 so Shopify retries", async () => {
    recordWebhookEvent.mockRejectedValue(new Error("db down"));
    await expect(handleWebhook(req())).rejects.toThrow("db down");
    expect(processWebhook).not.toHaveBeenCalled();
  });
});
