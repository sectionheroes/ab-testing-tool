import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getShopByDomain = vi.fn();
vi.mock("./shops.server", () => ({ getShopByDomain }));
vi.mock("../env.server", () => ({ env: (k: string) => (k === "SHOPIFY_API_SECRET" ? "hush" : "") }));
vi.mock("@sentry/react-router", () => ({ captureException: vi.fn() }));
const { authenticateProxy, proxyAction, proxySignatureString, readJsonBody, verifyProxySignature } = await import("./proxy.server");

// Both worked examples from shopify.dev (authenticate-app-proxies), shared secret "hush", shop "shop-name.myshopify.com".
const ANON = "extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=e072b6d7e6622d85912a5214b860d3100dc1e73d9bc29f43796ac8c9ff8093cb";
const LOGGED_IN = "extra=1&extra=2&shop=shop-name.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555&signature=4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb";
const DOC_NOW_MS = 1317327555 * 1000;

function signed(params: Record<string, string>, secret = "hush"): string {
  const p = new URLSearchParams(params);
  const sig = createHmac("sha256", secret).update(proxySignatureString(p)).digest("hex");
  p.set("signature", sig);
  return `http://localhost:3000/proxy/e?${p.toString()}`;
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 Chrome/128", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  getShopByDomain.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("verifyProxySignature", () => {
  it("matches the docs' anonymous example", () => {
    expect(proxySignatureString(new URL(`http://x/?${ANON}`).searchParams)).toBe("extra=1,2logged_in_customer_id=path_prefix=/apps/awesome_reviewsshop=shop-name.myshopify.comtimestamp=1317327555");
    expect(verifyProxySignature(new URL(`http://x/?${ANON}`), "hush", DOC_NOW_MS)).toBe("ok");
  });
  it("matches the docs' logged-in example", () => {
    expect(verifyProxySignature(new URL(`http://x/?${LOGGED_IN}`), "hush", DOC_NOW_MS)).toBe("ok");
  });
  it("rejects a tampered param, a wrong secret and a missing signature", () => {
    expect(verifyProxySignature(new URL(`http://x/?${ANON.replace("logged_in_customer_id=", "logged_in_customer_id=7")}`), "hush", DOC_NOW_MS)).toBe("bad-signature");
    expect(verifyProxySignature(new URL(`http://x/?${ANON}`), "other", DOC_NOW_MS)).toBe("bad-signature");
    expect(verifyProxySignature(new URL(`http://x/?${ANON.replace(/&signature=.*$/, "")}`), "hush", DOC_NOW_MS)).toBe("missing-signature");
  });
  it("accepts ±300 s and rejects 301 s (5-minute window)", () => {
    expect(verifyProxySignature(new URL(`http://x/?${ANON}`), "hush", DOC_NOW_MS + 300_000)).toBe("ok");
    expect(verifyProxySignature(new URL(`http://x/?${ANON}`), "hush", DOC_NOW_MS - 300_000)).toBe("ok");
    expect(verifyProxySignature(new URL(`http://x/?${ANON}`), "hush", DOC_NOW_MS + 301_000)).toBe("stale");
  });
});

describe("authenticateProxy", () => {
  const ts = () => String(Math.floor(Date.now() / 1000));
  it("405 on GET, 400 without shop, 401 on bad signature", async () => {
    expect(((await authenticateProxy(new Request("http://x/proxy/e"))) as Response).status).toBe(405);
    expect(((await authenticateProxy(post(signed({ timestamp: ts() }), {}))) as Response).status).toBe(400);
    expect(((await authenticateProxy(post(signed({ shop: "s.myshopify.com", timestamp: ts() }, "wrong"), {}))) as Response).status).toBe(401);
    expect(getShopByDomain).not.toHaveBeenCalled();
  });
  it("204 for unknown / PENDING / UNINSTALLED shops", async () => {
    getShopByDomain.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "s1", domain: "s.myshopify.com", status: "PENDING" }).mockResolvedValueOnce({ id: "s1", domain: "s.myshopify.com", status: "UNINSTALLED" });
    for (let i = 0; i < 3; i++) {
      expect(((await authenticateProxy(post(signed({ shop: "s.myshopify.com", timestamp: ts() }), {}))) as Response).status).toBe(204);
    }
  });
  it("context for ACTIVE shops: customerId from logged_in_customer_id only, '' → null", async () => {
    getShopByDomain.mockResolvedValue({ id: "s1", domain: "s.myshopify.com", status: "ACTIVE" });
    const anon = await authenticateProxy(post(signed({ shop: "s.myshopify.com", timestamp: ts(), logged_in_customer_id: "" }), {}));
    expect(anon).toEqual({ shop: { id: "s1", domain: "s.myshopify.com" }, customerId: null, userAgent: "Mozilla/5.0 Chrome/128" });
    const cust = await authenticateProxy(post(signed({ shop: "s.myshopify.com", timestamp: ts(), logged_in_customer_id: "10442451222812" }), {}));
    expect((cust as { customerId: string }).customerId).toBe("10442451222812");
  });
});

describe("readJsonBody", () => {
  it("parses ≤ 4 KB JSON, null for oversize, declared oversize or invalid JSON", async () => {
    expect(await readJsonBody(post("http://x/", { a: 1 }))).toEqual({ a: 1 });
    expect(await readJsonBody(post("http://x/", { a: "x".repeat(5000) }))).toBeNull();
    expect(await readJsonBody(post("http://x/", { a: 1 }, { "content-length": "99999" }))).toBeNull();
    expect(await readJsonBody(post("http://x/", "{not json"))).toBeNull();
  });
});

describe("proxyAction", () => {
  it("runs the handler with context + body and answers 204; handler errors still 204", async () => {
    getShopByDomain.mockResolvedValue({ id: "s1", domain: "s.myshopify.com", status: "ACTIVE" });
    const handler = vi.fn().mockResolvedValue("created");
    const url = signed({ shop: "s.myshopify.com", timestamp: String(Math.floor(Date.now() / 1000)) });
    expect((await proxyAction(post(url, { v: 1 }), handler)).status).toBe(204);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ shop: { id: "s1", domain: "s.myshopify.com" } }), { v: 1 });
    expect((await proxyAction(post(url, { v: 1 }), vi.fn().mockRejectedValue(new Error("db down")))).status).toBe(204);
  });
});
