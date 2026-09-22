import { describe, expect, it } from "vitest";
import { buildAbValue } from "../src/attribute";

// Same pattern as app/services/ab-value.ts (AB_VALUE_RE) – duplicated on purpose, lib/ must not import app/.
const PAIR = "[a-z0-9-]+:[a-z0-9-]+";
const AB_VALUE_RE = new RegExp(`^${PAIR}(,${PAIR})*$`);

describe("buildAbValue (contract 4.1)", () => {
  it("sorts by experiment key and joins with comma", () => {
    expect(buildAbValue([{ e: "free-shipping-bar", v: "a" }, { e: "pdp-reviews-above-price", v: "b" }, { e: "aaa", v: "c" }])).toBe("aaa:c,free-shipping-bar:a,pdp-reviews-above-price:b");
  });
  it("drops pairs with keys outside ^[a-z0-9-]+$ and yields a string the server parser accepts", () => {
    const v = buildAbValue([{ e: "ok-1", v: "b" }, { e: "Bad Key", v: "a" }, { e: "x", v: "a:b" }]);
    expect(v).toBe("ok-1:b");
    expect(AB_VALUE_RE.test(v)).toBe(true);
  });
  it("empty input → empty string (attribute cleared)", () => {
    expect(buildAbValue([])).toBe("");
  });
});
