// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { FORCE_KEY, parseForce, resolveForce } from "../src/force";

beforeEach(() => window.sessionStorage.clear());

describe("force mode (4.4)", () => {
  it("parses pairs and off", () => {
    expect(parseForce("demo-test:b")).toEqual({ "demo-test": "b" });
    expect(parseForce("a-1:b,c:a")).toEqual({ "a-1": "b", c: "a" });
    expect(parseForce("off")).toBe("off");
    expect(parseForce("garbage")).toBe(null);
    expect(parseForce(null)).toBe(null);
  });
  it("URL value is persisted for the session and read back without the param", () => {
    expect(resolveForce("?x=1&ab_force=demo-test%3Ab")).toEqual({ "demo-test": "b" });
    expect(window.sessionStorage.getItem(FORCE_KEY)).toBe("demo-test:b");
    expect(resolveForce("")).toEqual({ "demo-test": "b" });
    expect(resolveForce("?ab_force=off")).toBe("off");
    expect(resolveForce("")).toBe("off");
  });
});
