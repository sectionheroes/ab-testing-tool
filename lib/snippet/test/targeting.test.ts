import { describe, expect, it } from "vitest";
import { matches, matchesDevice, matchesUrl } from "../src/targeting";
import { device } from "../src/env";

describe("matchesUrl", () => {
  it("exact compares the pathname only, tolerant of a trailing slash", () => {
    expect(matchesUrl({ match: "exact", value: "/products/x" }, "/products/x", "?utm_source=ig")).toBe(true);
    expect(matchesUrl({ match: "exact", value: "/products/x/" }, "/products/x", "")).toBe(true);
    expect(matchesUrl({ match: "exact", value: "/products/x" }, "/products/xy", "")).toBe(false);
  });
  it("contains and regex see pathname + search", () => {
    expect(matchesUrl({ match: "contains", value: "variant=1" }, "/products/x", "?variant=1")).toBe(true);
    expect(matchesUrl({ match: "contains", value: "/collections/" }, "/products/x", "")).toBe(false);
    expect(matchesUrl({ match: "regex", value: "^/products/" }, "/products/x", "")).toBe(true);
    expect(matchesUrl({ match: "regex", value: "^/products/" }, "/collections/all", "")).toBe(false);
  });
  it("invalid regex never matches; missing rule always matches", () => {
    expect(matchesUrl({ match: "regex", value: "(" }, "/", "")).toBe(false);
    expect(matchesUrl(undefined, "/", "")).toBe(true);
  });
});

describe("device", () => {
  it("classifies common user agents", () => {
    expect(device("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe("mobile");
    expect(device("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe("mobile");
    expect(device("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe("tablet");
    expect(device("Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe("tablet");
    expect(device("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe("desktop");
  });
  it("matchesDevice: empty list = all", () => {
    expect(matchesDevice(undefined, "mobile")).toBe(true);
    expect(matchesDevice(["desktop"], "mobile")).toBe(false);
    expect(matchesDevice(["desktop", "mobile"], "mobile")).toBe(true);
  });
});

describe("matches", () => {
  const exp = (targeting: Record<string, unknown>) => ({ key: "x", status: "running" as const, allocation: 1, salt: "s", targeting, trigger: { type: "immediate" as const }, hideUntilApplied: false, variants: [] });
  it("ignores unknown targeting keys (schema is additive)", () => {
    expect(matches(exp({ country: ["DE"], utm: { source: "ig" }, customerStatus: "new" }), { pathname: "/", search: "", device: "desktop" })).toBe(true);
  });
  it("combines url and device", () => {
    const e = exp({ url: { match: "regex", value: "^/products/" }, device: ["mobile"] });
    expect(matches(e, { pathname: "/products/x", search: "", device: "mobile" })).toBe(true);
    expect(matches(e, { pathname: "/products/x", search: "", device: "desktop" })).toBe(false);
    expect(matches(e, { pathname: "/", search: "", device: "mobile" })).toBe(false);
  });
});
