import { describe, expect, it } from "vitest";
import { shopAmount, shopAmountOrZero, shopCurrency, sumAmounts } from "./money";

describe("money helpers", () => {
  const set = { shop_money: { amount: "12.34", currency_code: "USD" }, presentment_money: { amount: "10.50", currency_code: "EUR" } };
  it("reads shop_money only", () => {
    expect(shopAmount(set, "x")).toBe("12.34");
    expect(shopCurrency(set, "x")).toBe("USD");
  });
  it("throws when shop_money is missing – never falls back to presentment or a bare number", () => {
    expect(() => shopAmount({ presentment_money: { amount: "1.00" } }, "total_price_set")).toThrow(/total_price_set/);
    expect(() => shopAmount(undefined, "total_price_set")).toThrow();
    expect(() => shopCurrency({ shop_money: { amount: "1.00" } }, "x")).toThrow();
    expect(shopAmountOrZero(undefined, "x")).toBe("0.00");
  });
  it("sums decimal strings exactly", () => {
    expect(sumAmounts(["0.10", "0.20", "0.30"])).toBe("0.60");
    expect(sumAmounts(["89.99", "0.00", "-5.00"])).toBe("84.99");
    expect(sumAmounts([])).toBe("0.00");
    expect(sumAmounts(["100"])).toBe("100.00");
  });
});
