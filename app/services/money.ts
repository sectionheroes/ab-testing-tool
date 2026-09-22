// Pure. Money always comes from `*_set.shop_money.amount` (shop currency). Never total_price, never presentment.

export type MoneySet = { shop_money?: { amount?: unknown; currency_code?: unknown } };

const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

export class MoneyError extends Error {}

/** Decimal string from a price set; throws when shop_money is missing so a malformed payload lands in WebhookEvent.error. */
export function shopAmount(set: unknown, field: string): string {
  const amount = (set as MoneySet | undefined)?.shop_money?.amount;
  if (typeof amount === "string" && AMOUNT_RE.test(amount)) return amount;
  if (typeof amount === "number" && Number.isFinite(amount)) return amount.toFixed(2);
  throw new MoneyError(`${field}.shop_money.amount missing or not a decimal string`);
}

/** Like shopAmount, but "0.00" when the set is absent (optional sets such as total_shipping_price_set on some orders). */
export function shopAmountOrZero(set: unknown, field: string): string {
  if (set === undefined || set === null) return "0.00";
  return shopAmount(set, field);
}

export function shopCurrency(set: unknown, field: string): string {
  const code = (set as MoneySet | undefined)?.shop_money?.currency_code;
  if (typeof code !== "string" || !/^[A-Z]{3}$/.test(code)) throw new MoneyError(`${field}.shop_money.currency_code missing`);
  return code;
}

/** Sum decimal strings without floating point drift (cents as bigint). */
export function sumAmounts(amounts: string[]): string {
  let cents = 0n;
  for (const a of amounts) {
    if (!AMOUNT_RE.test(a)) throw new MoneyError(`not a decimal string: ${a}`);
    const neg = a.startsWith("-");
    const [int, frac = ""] = a.replace("-", "").split(".");
    const c = BigInt(int) * 100n + BigInt((frac + "00").slice(0, 2));
    cents += neg ? -c : c;
  }
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
