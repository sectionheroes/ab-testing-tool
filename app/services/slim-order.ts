// Pure. Builds Order.raw from the whitelist in plan §3 / rahmen §3.1 – never the full payload (~30 KB → ~4 KB).
// Runs after stripPii(). Anything not listed here is dropped, including presentment money.

export type ShopMoney = { amount: string; currency_code: string };

type Json = Record<string, unknown>;

const LINE_ITEM_KEYS = ["id", "variant_id", "product_id", "quantity", "price", "properties"] as const;
const SHIPPING_LINE_KEYS = ["id", "title", "code", "source"] as const;
const SCALAR_KEYS = ["id", "name", "created_at", "financial_status", "cancelled_at", "source_name", "test", "currency"] as const;

/** Every top-level key of the whitelist (plus the money-set pattern). Exported for the whitelist test. */
export const RAW_WHITELIST = {
  scalars: SCALAR_KEYS,
  moneySetPattern: /^[a-z_]+_set$/,
  lineItem: [...LINE_ITEM_KEYS, "price_set"],
  shippingLine: [...SHIPPING_LINE_KEYS, "price_set", "discounted_price_set"],
  noteAttribute: ["name", "value"],
  customer: ["id"],
} as const;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pick(src: Json, keys: readonly string[]): Json {
  const out: Json = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** `{ shop_money, presentment_money }` → `{ shop_money }`. Presentment is never stored. */
function shopMoneyOnly(set: unknown): { shop_money: ShopMoney } | undefined {
  if (!isObject(set) || !isObject(set.shop_money)) return undefined;
  const m = set.shop_money as Partial<ShopMoney>;
  if (typeof m.amount !== "string" || typeof m.currency_code !== "string") return undefined;
  return { shop_money: { amount: m.amount, currency_code: m.currency_code } };
}

function moneySets(src: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(src)) {
    if (!RAW_WHITELIST.moneySetPattern.test(k)) continue;
    const s = shopMoneyOnly(v);
    if (s) out[k] = s;
  }
  return out;
}

export function slimOrder(order: Json): Json {
  const out: Json = pick(order, SCALAR_KEYS);
  Object.assign(out, moneySets(order));

  if (Array.isArray(order.note_attributes)) {
    out.note_attributes = order.note_attributes.filter(isObject).map((a) => pick(a, RAW_WHITELIST.noteAttribute));
  }
  if (Array.isArray(order.line_items)) {
    out.line_items = order.line_items.filter(isObject).map((li) => {
      const slim = pick(li, LINE_ITEM_KEYS);
      const price = shopMoneyOnly(li.price_set);
      if (price) slim.price_set = price;
      return slim;
    });
  }
  if (Array.isArray(order.shipping_lines)) {
    out.shipping_lines = order.shipping_lines.filter(isObject).map((sl) => {
      const slim = pick(sl, SHIPPING_LINE_KEYS);
      const price = shopMoneyOnly(sl.price_set);
      if (price) slim.price_set = price;
      const discounted = shopMoneyOnly(sl.discounted_price_set);
      if (discounted) slim.discounted_price_set = discounted;
      return slim;
    });
  }
  if (isObject(order.customer) && order.customer.id !== undefined) out.customer = { id: order.customer.id };
  else out.customer = null;

  return out;
}
