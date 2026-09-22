import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  experiment: { findUnique: vi.fn() },
  exposure: { createMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  variant: { findMany: vi.fn() },
  snippetError: { create: vi.fn(), findMany: vi.fn() },
};
vi.mock("../db.server", () => ({ default: prisma }));
const captureMessage = vi.fn().mockReturnValue("evt-1");
vi.mock("@sentry/react-router", () => ({ captureMessage }));
const { _resetSnippetErrorThrottles, isBotUaForTest, linkVisitor, listExposureCounts, parseExposureBody, recordExposure, recordSnippetError, SNIPPET_ERROR_ROWS_PER_HOUR } = await import("./exposures.server").then(async (m) => ({
  ...m,
  isBotUaForTest: (await import("./bots.server")).isBotUa,
}));

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ctx = (over: Partial<{ customerId: string | null; userAgent: string | null }> = {}) => ({
  shop: { id: "shop1", domain: "s.myshopify.com" },
  customerId: null,
  userAgent: CHROME,
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({ v: 1, e: "demo-test", var: "b", vid: "b1f7e2c0-1234-4abc-9def-0123456789ab", cid: null, url: "/products/x", dev: "mobile", ref: "", utm: null, t: 1726650000, ...over });
const running = { id: "exp1", status: "RUNNING", variants: [{ id: "va", key: "a" }, { id: "vb", key: "b" }] };

beforeEach(() => {
  for (const group of Object.values(prisma)) for (const fn of Object.values(group)) fn.mockReset();
  captureMessage.mockClear();
  _resetSnippetErrorThrottles();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("bots.server isBotUa", () => {
  it("real browser false; crawler, Lighthouse, headless and missing UA true", () => {
    expect(isBotUaForTest(CHROME)).toBe(false);
    expect(isBotUaForTest("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUaForTest("Mozilla/5.0 (Linux; Android 11; moto g power (2022)) Chrome/128 Mobile Safari/537.36 Chrome-Lighthouse")).toBe(true);
    expect(isBotUaForTest("Mozilla/5.0 HeadlessChrome/128")).toBe(true);
    expect(isBotUaForTest(null)).toBe(true);
    expect(isBotUaForTest("")).toBe(true);
  });
});

describe("parseExposureBody", () => {
  it("accepts the contract payload and rejects bad slugs, devices, oversize and non-string utm", () => {
    expect(parseExposureBody(body())).toMatchObject({ e: "demo-test", variant: "b", dev: "mobile", ref: null, utm: null, cid: null });
    expect(parseExposureBody(body({ cid: 42, utm: { source: "ig", medium: "paid" } }))).toMatchObject({ cid: "42", utm: { source: "ig", medium: "paid" } });
    expect(parseExposureBody(body({ v: 2 }))).toBeNull();
    expect(parseExposureBody(body({ e: "Demo Test" }))).toBeNull();
    expect(parseExposureBody(body({ dev: "tv" }))).toBeNull();
    expect(parseExposureBody(body({ url: "x".repeat(3000) }))).toBeNull();
    expect(parseExposureBody(body({ utm: { source: 1 } }))).toBeNull();
    expect(parseExposureBody(body({ utm: { campaign: "c".repeat(500) } }))?.utm?.campaign).toHaveLength(200);
    expect(parseExposureBody(body({ utm: "ig" }))).toBeNull();
    expect(parseExposureBody("nope")).toBeNull();
    expect(parseExposureBody(null)).toBeNull();
  });
});

describe("recordExposure", () => {
  it("creates with createMany + skipDuplicates; duplicate → count 0 → 'duplicate'", async () => {
    prisma.experiment.findUnique.mockResolvedValue(running);
    prisma.exposure.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await recordExposure(ctx(), body())).toBe("created");
    expect(prisma.exposure.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [expect.objectContaining({ shopId: "shop1", experimentId: "exp1", variantId: "vb", visitorId: body().vid, customerId: null, device: "mobile", country: null, isBot: false })],
      }),
    );
    expect(await recordExposure(ctx(), body())).toBe("duplicate");
  });

  it("non-RUNNING experiment, unknown experiment or variant → ignored, nothing written, logged once", async () => {
    prisma.experiment.findUnique.mockResolvedValueOnce({ ...running, status: "PAUSED" }).mockResolvedValueOnce(null).mockResolvedValueOnce(running).mockResolvedValueOnce(running);
    expect(await recordExposure(ctx(), body())).toBe("ignored");
    expect(await recordExposure(ctx(), body({ e: "gone" }))).toBe("ignored");
    expect(await recordExposure(ctx(), body({ var: "z" }))).toBe("ignored");
    expect(await recordExposure(ctx(), body({ var: "z" }))).toBe("ignored");
    expect(prisma.exposure.createMany).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it("customerId comes from the proxy context only – body cid is ignored (and a mismatch logged)", async () => {
    prisma.experiment.findUnique.mockResolvedValue(running);
    prisma.exposure.createMany.mockResolvedValue({ count: 1 });
    await recordExposure(ctx({ customerId: "10442451222812" }), body({ cid: 999 }));
    expect(prisma.exposure.createMany.mock.calls[0][0].data[0].customerId).toBe("10442451222812");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("body cid 999"));
    await recordExposure(ctx({ customerId: null }), body({ cid: 999 }));
    expect(prisma.exposure.createMany.mock.calls[1][0].data[0].customerId).toBeNull();
  });

  it("bot UA → isBot true", async () => {
    prisma.experiment.findUnique.mockResolvedValue(running);
    prisma.exposure.createMany.mockResolvedValue({ count: 1 });
    await recordExposure(ctx({ userAgent: "Mozilla/5.0 (compatible; bingbot/2.0)" }), body());
    expect(prisma.exposure.createMany.mock.calls[0][0].data[0].isBot).toBe(true);
  });

  it("invalid body → 'invalid', no DB access", async () => {
    expect(await recordExposure(ctx(), { v: 1, e: "x" })).toBe("invalid");
    expect(await recordExposure(ctx(), null)).toBe("invalid");
    expect(prisma.experiment.findUnique).not.toHaveBeenCalled();
  });
});

describe("linkVisitor", () => {
  it("no logged-in customer → no-op", async () => {
    expect(await linkVisitor(ctx(), { v: 1, vid: body().vid })).toBe("no-customer");
    expect(prisma.exposure.updateMany).not.toHaveBeenCalled();
  });
  it("sets customerId only where null; a different existing customerId is never overwritten (logged)", async () => {
    prisma.exposure.updateMany.mockResolvedValue({ count: 2 });
    prisma.exposure.count.mockResolvedValue(1);
    expect(await linkVisitor(ctx({ customerId: "77" }), { v: 1, vid: body().vid })).toBe("linked");
    expect(prisma.exposure.updateMany).toHaveBeenCalledWith({ where: { shopId: "shop1", visitorId: body().vid, customerId: null }, data: { customerId: "77" } });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("linked to another customer"));
  });
  it("invalid body → invalid", async () => {
    expect(await linkVisitor(ctx({ customerId: "77" }), { v: 1, vid: "short" })).toBe("invalid");
    expect(prisma.exposure.updateMany).not.toHaveBeenCalled();
  });
});

describe("recordSnippetError", () => {
  const err = { v: 1, e: "demo-test", var: "b", msg: "boom", stack: "Error: boom\n at x", url: "/products/x" };
  it("stores the row with UA and sends one Sentry event per (shop, experiment, message) per 10 min", async () => {
    prisma.snippetError.create.mockResolvedValue({});
    expect(await recordSnippetError(ctx(), err, 0)).toBe("stored+sentry");
    expect(prisma.snippetError.create).toHaveBeenCalledWith({
      data: { shopId: "shop1", experimentKey: "demo-test", variantKey: "b", message: "boom", stack: err.stack, url: "/products/x", userAgent: CHROME },
    });
    expect(captureMessage).toHaveBeenCalledWith("snippet error in demo-test:b: boom", expect.objectContaining({ tags: { shop: "s.myshopify.com", experiment: "demo-test", variant: "b" } }));
    expect(await recordSnippetError(ctx(), err, 5 * 60 * 1000)).toBe("stored");
    expect(await recordSnippetError(ctx(), { ...err, msg: "other" }, 5 * 60 * 1000)).toBe("stored+sentry");
    expect(await recordSnippetError(ctx(), err, 10 * 60 * 1000)).toBe("stored+sentry");
    expect(captureMessage).toHaveBeenCalledTimes(3);
    expect(prisma.snippetError.create).toHaveBeenCalledTimes(4);
  });
  it("caps rows at 500 per shop per rolling hour, then only logs; window resets after an hour", async () => {
    prisma.snippetError.create.mockResolvedValue({});
    for (let i = 0; i < SNIPPET_ERROR_ROWS_PER_HOUR; i++) await recordSnippetError(ctx(), err, 1000);
    expect(await recordSnippetError(ctx(), err, 2000)).toBe("capped");
    expect(prisma.snippetError.create).toHaveBeenCalledTimes(SNIPPET_ERROR_ROWS_PER_HOUR);
    expect(await recordSnippetError({ ...ctx(), shop: { id: "shop2", domain: "t.myshopify.com" } }, err, 2000)).toBe("stored+sentry"); // cap is per shop
    expect(await recordSnippetError(ctx(), err, 1000 + 60 * 60 * 1000)).not.toBe("capped");
  });
  it("invalid body → invalid, nothing stored", async () => {
    expect(await recordSnippetError(ctx(), { v: 1, e: "demo-test" })).toBe("invalid");
    expect(prisma.snippetError.create).not.toHaveBeenCalled();
  });
});

describe("listExposureCounts", () => {
  it("groups by experiment/variant with visitor vs bot counts", async () => {
    prisma.exposure.groupBy.mockResolvedValue([
      { experimentId: "exp1", variantId: "va", isBot: false, _count: { _all: 10 } },
      { experimentId: "exp1", variantId: "va", isBot: true, _count: { _all: 2 } },
      { experimentId: "exp1", variantId: "vb", isBot: false, _count: { _all: 9 } },
    ]);
    prisma.variant.findMany.mockResolvedValue([
      { id: "va", key: "a", experiment: { key: "demo-test" } },
      { id: "vb", key: "b", experiment: { key: "demo-test" } },
    ]);
    expect(await listExposureCounts("shop1")).toEqual([
      { experimentKey: "demo-test", variantKey: "a", visitors: 10, bots: 2 },
      { experimentKey: "demo-test", variantKey: "b", visitors: 9, bots: 0 },
    ]);
  });
});
