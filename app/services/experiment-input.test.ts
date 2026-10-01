/**
 * The form's rules, tested where they are cheap to test. Three of them are contracts rather than preferences:
 * the key pattern of 4.1, the targeting/trigger shapes of 4.2, and the weeks → days translation of ADR-0036.
 */
import { describe, expect, it } from "vitest";
import {
  emptyExperimentInput,
  fromTargeting,
  fromTrigger,
  fullWeeksFromDays,
  fractionToPct,
  parseExperimentForm,
  pctToFraction,
  slugify,
  toStoppingRule,
  toTargeting,
  toTrigger,
  validateExperimentInput,
  type ExperimentInput,
} from "./experiment-input";

const valid = (): ExperimentInput => ({
  ...emptyExperimentInput(),
  name: "PDP: Reviews above price",
  key: "pdp-reviews-above-price",
  urlValue: "/products/",
  variants: [
    { key: "a", name: "Control", weightPct: 50, js: "", css: "" },
    { key: "b", name: "Reviews above price", weightPct: 50, js: "", css: "" },
  ],
});

describe("slugify (contract 4.1: ^[a-z0-9-]+$)", () => {
  it("produces a key that matches the contract", () => {
    expect(slugify("PDP: Reviews above price")).toBe("pdp-reviews-above-price");
    expect(slugify("  Cart — free shipping!  ")).toBe("cart-free-shipping");
    expect(slugify("Größe & Farbe")).toBe("groesse-farbe");
  });

  it("never leaves a separator at either end", () => {
    for (const name of ["– leading", "trailing –", "a".repeat(80)]) {
      expect(slugify(name)).toMatch(/^[a-z0-9-]+$/);
      expect(slugify(name).startsWith("-")).toBe(false);
      expect(slugify(name).endsWith("-")).toBe(false);
    }
  });
});

describe("validateExperimentInput", () => {
  it("accepts a complete form", () => {
    expect(validateExperimentInput(valid())).toEqual({});
  });

  it("rejects a key that is already used in this shop (Figma state 4)", () => {
    const errors = validateExperimentInput(valid(), { takenKeys: ["pdp-reviews-above-price"] });
    expect(errors.key).toContain("already used");
  });

  it("rejects a key with a separator of the cart attribute", () => {
    // `:` and `,` separate entries in `_ab` (4.1); a key containing one corrupts the attribution of every order.
    expect(validateExperimentInput({ ...valid(), key: "pdp:reviews" }).key).toBeDefined();
    expect(validateExperimentInput({ ...valid(), key: "pdp,reviews" }).key).toBeDefined();
    expect(validateExperimentInput({ ...valid(), key: "PDP-Reviews" }).key).toBeDefined();
  });

  it("rejects a pattern that does not compile", () => {
    expect(validateExperimentInput({ ...valid(), urlMatch: "regex", urlValue: "^/products/(.*" }).urlValue).toBe("This pattern is not valid.");
    expect(validateExperimentInput({ ...valid(), urlMatch: "regex", urlValue: "^/products/" }).urlValue).toBeUndefined();
  });

  it("reports splits that do not add up to 100 %", () => {
    const input = valid();
    input.variants[1].weightPct = 40;
    expect(validateExperimentInput(input).weights).toBe("Splits add up to 90 %. They need to add up to 100 %.");
  });

  it("wants a selector when the trigger waits for an element", () => {
    expect(validateExperimentInput({ ...valid(), triggerType: "visible" }).triggerSelector).toBeDefined();
    expect(validateExperimentInput({ ...valid(), triggerType: "visible", triggerSelector: ".product__rating" }).triggerSelector).toBeUndefined();
  });

  it("wants at least one device and a name per variant", () => {
    expect(validateExperimentInput({ ...valid(), devices: [] }).devices).toBeDefined();
    const unnamed = valid();
    unnamed.variants[1].name = "";
    expect(validateExperimentInput(unnamed)["variant.1.name"]).toBeDefined();
  });
});

describe("contract 4.2 shapes", () => {
  it("round-trips targeting", () => {
    const input = { ...valid(), urlMatch: "regex" as const, urlValue: "^/products/", devices: ["mobile" as const] };
    const targeting = toTargeting(input);
    expect(targeting).toEqual({ url: { match: "regex", value: "^/products/" }, device: ["mobile"] });
    expect(fromTargeting(targeting)).toEqual({ urlMatch: "regex", urlValue: "^/products/", devices: ["mobile"] });
  });

  it("round-trips both triggers", () => {
    expect(toTrigger({ triggerType: "immediate", triggerSelector: "" })).toEqual({ type: "immediate" });
    expect(toTrigger({ triggerType: "visible", triggerSelector: ".x" })).toEqual({ type: "visible", selector: ".x" });
    expect(fromTrigger({ type: "visible", selector: ".x" })).toEqual({ triggerType: "visible", triggerSelector: ".x" });
  });

  it("falls back to defaults rather than throwing on an unknown shape", () => {
    expect(fromTargeting(null).urlMatch).toBe("contains");
    expect(fromTargeting({ url: { match: "nonsense" } }).urlMatch).toBe("contains");
    expect(fromTrigger(undefined)).toEqual({ triggerType: "immediate", triggerSelector: "" });
  });
});

describe("stopping rule (ADR-0036)", () => {
  it("writes whole weeks as days and always requires full weeks", () => {
    expect(toStoppingRule({ minConversionsPerArm: 1000, minFullWeeks: 2 })).toEqual({
      minConversionsPerArm: 1000,
      minDurationDays: 14,
      requireFullWeeks: true,
    });
  });

  it("rounds days up to weeks, so the form never displays a looser rule than the one stored", () => {
    expect(fullWeeksFromDays(14)).toBe(2);
    expect(fullWeeksFromDays(10)).toBe(2);
    expect(fullWeeksFromDays(null)).toBe(1);
    expect(fullWeeksFromDays(0)).toBe(1);
  });
});

describe("percentages", () => {
  it("round-trip between the form's percent and the model's fraction", () => {
    expect(pctToFraction(50)).toBe(0.5);
    expect(pctToFraction(100)).toBe(1);
    expect(fractionToPct(0.5)).toBe(50);
    expect(fractionToPct(1)).toBe(100);
    expect(fractionToPct(pctToFraction(33))).toBe(33);
  });
});

describe("parseExperimentForm", () => {
  const form = () => {
    const f = new FormData();
    f.set("name", "  PDP: Reviews  ");
    f.set("key", "PDP-Reviews");
    f.set("hypothesis", "If we …");
    f.set("primaryMetric", "RPV");
    f.set("urlMatch", "regex");
    f.set("urlValue", " ^/products/ ");
    f.set("device.mobile", "on");
    f.set("device.desktop", "on");
    f.set("triggerType", "visible");
    f.set("triggerSelector", " .product__rating ");
    f.set("hideUntilApplied", "on");
    f.set("allocationPct", "80");
    f.set("minConversionsPerArm", "1500");
    f.set("minFullWeeks", "3");
    f.set("variantCount", "2");
    f.set("variant.0.key", "a");
    f.set("variant.0.name", "Control");
    f.set("variant.0.weight", "60");
    f.set("variant.1.key", "b");
    f.set("variant.1.name", "Reviews above price");
    f.set("variant.1.weight", "40");
    f.set("variant.1.js", "document.title='b'");
    f.set("variant.1.css", ".x{}");
    return f;
  };

  it("reads the whole form, trimmed", () => {
    const input = parseExperimentForm(form());
    expect(input).toMatchObject({
      name: "PDP: Reviews",
      key: "pdp-reviews",
      primaryMetric: "RPV",
      urlMatch: "regex",
      urlValue: "^/products/",
      devices: ["mobile", "desktop"],
      triggerType: "visible",
      triggerSelector: ".product__rating",
      hideUntilApplied: true,
      allocationPct: 80,
      minConversionsPerArm: 1500,
      minFullWeeks: 3,
    });
    expect(input.variants).toHaveLength(2);
    expect(input.variants[1]).toMatchObject({ key: "b", weightPct: 40, js: "document.title='b'", css: ".x{}" });
  });

  it("treats an unchecked checkbox as off and an unknown value as the default", () => {
    const f = form();
    f.delete("device.mobile");
    f.delete("device.desktop");
    f.delete("hideUntilApplied");
    f.set("primaryMetric", "NONSENSE");
    f.set("urlMatch", "NONSENSE");
    const input = parseExperimentForm(f);
    expect(input.devices).toEqual([]);
    expect(input.hideUntilApplied).toBe(false);
    expect(input.primaryMetric).toBe("CR");
    expect(input.urlMatch).toBe("contains");
  });
});
