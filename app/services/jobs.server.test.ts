import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { webhookEvent: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() } };
vi.mock("../db.server", () => ({ default: db }));
vi.mock("../env.server", () => ({ env: (k: string) => (k === "JOBS_SECRET" ? "s3cret" : "") }));
const processWebhook = vi.fn();
vi.mock("./webhook-processing.server", () => ({ processWebhook, keepsPayloadOnSuccess: (t: string) => t === "customers/data_request" }));
const { cleanup, requireJobsSecret, retryWebhooks } = await import("./jobs.server");

beforeEach(() => {
  db.webhookEvent.findMany.mockReset();
  db.webhookEvent.update.mockReset();
  db.webhookEvent.deleteMany.mockReset();
  processWebhook.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("requireJobsSecret", () => {
  const req = (method: string, secret?: string) => new Request("http://x/jobs/retry-webhooks", { method, headers: secret ? { "X-Jobs-Secret": secret } : {} });
  it("accepts POST with the right header only", () => {
    expect(requireJobsSecret(req("POST", "s3cret"))).toBeNull();
    expect(requireJobsSecret(req("POST", "wrong"))?.status).toBe(401);
    expect(requireJobsSecret(req("POST"))?.status).toBe(401);
    expect(requireJobsSecret(req("GET", "s3cret"))?.status).toBe(405);
  });
});

describe("retryWebhooks", () => {
  const event = (id: string, topic = "refunds/create") => ({ id, shopId: "shop1", topic, attempts: 1, payload: { id: 1 }, shop: { domain: "s.myshopify.com" } });

  it("selects error && attempts < 5 && payload present, clears payload on success, bumps attempts on failure", async () => {
    db.webhookEvent.findMany.mockResolvedValue([event("ok"), event("bad"), event("export", "customers/data_request")]);
    processWebhook.mockImplementation(async ({ eventId }: { eventId: string }) => {
      if (eventId === "bad") throw new Error("still broken");
      return "fine";
    });
    const r = await retryWebhooks();
    expect(r).toMatchObject({ candidates: 3, succeeded: 2, failed: 1 });
    const where = db.webhookEvent.findMany.mock.calls[0][0].where;
    expect(where.error).toEqual({ not: null });
    expect(where.attempts).toEqual({ lt: 5 });
    expect(processWebhook.mock.calls[0][0]).toEqual({ eventId: "ok", shopId: "shop1", shopDomain: "s.myshopify.com", topic: "refunds/create", payload: { id: 1 } });
    const updates = Object.fromEntries(db.webhookEvent.update.mock.calls.map((c) => [c[0].where.id, c[0].data]));
    expect(updates.ok.error).toBeNull();
    expect(updates.ok.processedAt).toBeInstanceOf(Date);
    expect("payload" in updates.ok).toBe(true);
    expect("payload" in updates.export).toBe(false);
    expect(updates.bad).toEqual({ error: "Error: still broken", attempts: { increment: 1 } });
  });
});

describe("cleanup", () => {
  it("deletes WebhookEvent rows older than 30 days in batches, keeping data_request exports", async () => {
    db.webhookEvent.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]).mockResolvedValueOnce([]);
    db.webhookEvent.deleteMany.mockResolvedValue({ count: 2 });
    const now = new Date("2026-10-22T05:00:00Z");
    expect(await cleanup(now)).toEqual({ webhookEvents: 2 });
    const where = db.webhookEvent.findMany.mock.calls[0][0].where;
    expect(where.receivedAt.lt.toISOString()).toBe("2026-09-22T05:00:00.000Z");
    expect(where.NOT.topic).toBe("customers/data_request");
    expect(db.webhookEvent.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a", "b"] } } });
  });
});
