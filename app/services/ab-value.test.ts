import { describe, expect, it } from "vitest";
import { abFromLineItems, abFromNoteAttributes, extractAbValue, extractVisitorId, parseAbValue } from "./ab-value";

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

describe("extractVisitorId (contract 4.1b)", () => {
  const VID = "44f15d3c-6f0a-4b1e-9f7c-2a1b8e0d5c31";

  it("prefers the cart attribute over the line item property, like `_ab`", () => {
    const order = {
      note_attributes: [{ name: "_ab_v", value: VID }],
      line_items: [{ properties: [{ name: "_ab_v", value: "99999999-9999-4999-8999-999999999999" }] }],
    };
    expect(extractVisitorId(order)).toEqual({ value: VID, source: "CART_ATTRIBUTE" });
  });

  it("falls back to the line item property (array and object form) – the Buy Now path", () => {
    expect(extractVisitorId({ line_items: [{ properties: [{ name: "_ab_v", value: VID }] }] })).toEqual({
      value: VID,
      source: "LINE_ITEM_PROPERTY",
    });
    expect(extractVisitorId({ line_items: [{ properties: { _ab_v: VID } }] })).toEqual({ value: VID, source: "LINE_ITEM_PROPERTY" });
  });

  it("takes the first non-empty line item property", () => {
    const order = { line_items: [{ properties: [] }, { properties: [{ name: "_ab_v", value: VID }] }] };
    expect(extractVisitorId(order)).toEqual({ value: VID, source: "LINE_ITEM_PROPERTY" });
  });

  it("is independent of `_ab`: either can be there without the other", () => {
    expect(extractVisitorId({ note_attributes: [{ name: "_ab", value: "demo-test:b" }] })).toBeNull();
    expect(extractVisitorId({ note_attributes: [{ name: "_ab_v", value: VID }] })).not.toBeNull();
  });

  it("lowercases so the value matches Exposure.visitorId whatever case the cart returned", () => {
    expect(extractVisitorId({ note_attributes: [{ name: "_ab_v", value: VID.toUpperCase() }] })?.value).toBe(VID);
  });

  it("trims surrounding whitespace", () => {
    expect(extractVisitorId({ note_attributes: [{ name: "_ab_v", value: `  ${VID}  ` }] })?.value).toBe(VID);
  });

  it("insists on UUID v4 – anything else is null, not a phantom visitor", () => {
    const bad = [
      "not-a-uuid",
      "",
      "   ",
      "44f15d3c6f0a4b1e9f7c2a1b8e0d5c31", // no dashes
      "11111111-1111-1111-1111-111111111111", // version nibble 1
      "44f15d3c-6f0a-4b1e-0f7c-2a1b8e0d5c31", // variant nibble 0
      `${VID}x`,
      `x${VID}`,
      "demo-test:b",
      42,
      null,
    ];
    for (const value of bad) {
      expect(extractVisitorId({ note_attributes: [{ name: "_ab_v", value }] })).toBeNull();
      expect(extractVisitorId({ line_items: [{ properties: [{ name: "_ab_v", value }] }] })).toBeNull();
    }
  });

  it("returns null when the order carries nothing at all", () => {
    expect(extractVisitorId({})).toBeNull();
    expect(extractVisitorId({ note_attributes: [], line_items: [] })).toBeNull();
  });

  it("does not confuse `_ab` with `_ab_v`", () => {
    expect(extractVisitorId({ note_attributes: [{ name: "_ab", value: VID }] })).toBeNull();
    expect(extractAbValue({ note_attributes: [{ name: "_ab_v", value: VID }] })).toBeNull();
  });
});
