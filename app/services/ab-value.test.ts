import { describe, expect, it } from "vitest";
import { abFromLineItems, abFromNoteAttributes, extractAbValue, parseAbValue } from "./ab-value";

describe("parseAbValue (contract 4.1)", () => {
  it("parses a single pair", () => {
    expect(parseAbValue("demo-test:b")).toEqual([{ experimentKey: "demo-test", variantKey: "b" }]);
  });
  it("parses several pairs and keeps the first on duplicate experiment keys", () => {
    expect(parseAbValue("free-shipping-bar:a,pdp-reviews-above-price:b,free-shipping-bar:b")).toEqual([
      { experimentKey: "free-shipping-bar", variantKey: "a" },
      { experimentKey: "pdp-reviews-above-price", variantKey: "b" },
    ]);
  });
  it("rejects anything outside ^[a-z0-9-]+:[a-z0-9-]+(,…)*$", () => {
    for (const bad of ["", "demo-test", "Demo-Test:b", "demo_test:b", "demo-test:b,", ",demo-test:b", "demo-test:b;x:a", "demo-test: b", "a:b:c", 42, null, undefined]) {
      expect(parseAbValue(bad)).toBeNull();
    }
  });
});

describe("extractAbValue", () => {
  const cart = { note_attributes: [{ name: "foo", value: "1" }, { name: "_ab", value: "demo-test:b" }] };
  const lineArray = { line_items: [{ properties: [] }, { properties: [{ name: "_ab", value: "demo-test:a" }] }] };
  const lineObject = { line_items: [{ properties: { _ab: "demo-test:a" } }] };

  it("prefers the cart attribute over the line item property", () => {
    expect(extractAbValue({ ...cart, ...lineArray })).toEqual({ value: "demo-test:b", source: "CART_ATTRIBUTE" });
  });
  it("falls back to the first non-empty line item property (array and object form)", () => {
    expect(extractAbValue(lineArray)).toEqual({ value: "demo-test:a", source: "LINE_ITEM_PROPERTY" });
    expect(extractAbValue(lineObject)).toEqual({ value: "demo-test:a", source: "LINE_ITEM_PROPERTY" });
    expect(extractAbValue({ note_attributes: [{ name: "_ab", value: "" }], ...lineArray })).toEqual({ value: "demo-test:a", source: "LINE_ITEM_PROPERTY" });
  });
  it("returns null when neither carries _ab", () => {
    expect(extractAbValue({ note_attributes: [], line_items: [{ properties: [{ name: "gift", value: "yes" }] }] })).toBeNull();
    expect(abFromNoteAttributes({})).toBeNull();
    expect(abFromLineItems({})).toBeNull();
  });
});
