import { describe, expect, it } from "vitest";
import { clientShopIdFromPath, isInternal, resolveAccess } from "./auth.rules";

describe("resolveAccess", () => {
  it("lets invited users in with their stored role", () => {
    expect(resolveAccess("hello@sectionheroes.de", "ADMIN")).toBe("ADMIN");
    expect(resolveAccess("someone@gmail.com", "CLIENT")).toBe("CLIENT");
  });
  it("auto-admits @sectionheroes.de as MEMBER", () => {
    expect(resolveAccess("New.Person@SectionHeroes.de", null)).toBe("MEMBER");
  });
  it("denies everyone else", () => {
    expect(resolveAccess("stranger@gmail.com", null)).toBeNull();
    expect(resolveAccess("x@sectionheroes.de.evil.com", null)).toBeNull();
    expect(resolveAccess("x@notsectionheroes.de", null)).toBeNull();
  });
});

describe("guards", () => {
  it("isInternal", () => {
    expect(isInternal("ADMIN")).toBe(true);
    expect(isInternal("MEMBER")).toBe(true);
    expect(isInternal("CLIENT")).toBe(false);
  });
  it("clientShopIdFromPath", () => {
    expect(clientShopIdFromPath("/dashboard/shops/abc")).toBe("abc");
    expect(clientShopIdFromPath("/dashboard/shops/abc/experiments")).toBe("abc");
    expect(clientShopIdFromPath("/dashboard/shops")).toBeNull();
    expect(clientShopIdFromPath("/dashboard/users")).toBeNull();
  });
});
