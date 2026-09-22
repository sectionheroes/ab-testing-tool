// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { VID_KEY, getVisitorId } from "../src/visitor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clearCookie = () => (document.cookie = `${VID_KEY}=; Max-Age=0; Path=/`);

beforeEach(() => {
  window.localStorage.clear();
  clearCookie();
});

describe("visitor id (4.4 / ADR-0028)", () => {
  it("cookie wins over localStorage", () => {
    document.cookie = `${VID_KEY}=11111111-1111-4111-8111-111111111111; Path=/`;
    window.localStorage.setItem(VID_KEY, "22222222-2222-4222-8222-222222222222");
    expect(getVisitorId()).toBe("11111111-1111-4111-8111-111111111111");
    expect(window.localStorage.getItem(VID_KEY)).toBe("11111111-1111-4111-8111-111111111111");
  });
  it("localStorage restores a lost cookie", () => {
    window.localStorage.setItem(VID_KEY, "22222222-2222-4222-8222-222222222222");
    expect(getVisitorId()).toBe("22222222-2222-4222-8222-222222222222");
    expect(document.cookie).toContain(`${VID_KEY}=22222222-2222-4222-8222-222222222222`);
  });
  it("new UUID v4 when both are missing, written to both, stable afterwards", () => {
    const id = getVisitorId();
    expect(id).toMatch(UUID);
    expect(document.cookie).toContain(`${VID_KEY}=${id}`);
    expect(window.localStorage.getItem(VID_KEY)).toBe(id);
    expect(getVisitorId()).toBe(id);
  });
  it("ignores a malformed cookie value", () => {
    document.cookie = `${VID_KEY}=not-a-uuid; Path=/`;
    expect(getVisitorId()).toMatch(UUID);
  });
});
