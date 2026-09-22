// Pure. Contract 4.1: `_ab` = "<experiment_key>:<variant_key>[,<experiment_key>:<variant_key>...]", keys `^[a-z0-9-]+$`.
// Read from note_attributes first, then the first non-empty line_items[].properties[_ab]. Never change this format.

export const AB_KEY = "_ab";
const PAIR = "[a-z0-9-]+:[a-z0-9-]+";
export const AB_VALUE_RE = new RegExp(`^${PAIR}(,${PAIR})*$`);

export type AbPair = { experimentKey: string; variantKey: string };

/** null when the string does not match the contract at all (then nothing is attributed and it is logged). */
export function parseAbValue(value: unknown): AbPair[] | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!AB_VALUE_RE.test(v)) return null;
  const seen = new Map<string, AbPair>();
  for (const pair of v.split(",")) {
    const [experimentKey, variantKey] = pair.split(":");
    if (!seen.has(experimentKey)) seen.set(experimentKey, { experimentKey, variantKey }); // first wins on duplicates
  }
  return [...seen.values()];
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** note_attributes: [{ name, value }] */
export function abFromNoteAttributes(order: Json): string | null {
  if (!Array.isArray(order.note_attributes)) return null;
  for (const a of order.note_attributes) {
    if (isObject(a) && a.name === AB_KEY && nonEmpty(a.value)) return a.value.trim();
  }
  return null;
}

/** line_items[].properties: either [{ name, value }] (webhook form) or { _ab: "…" } (cart.js form). First non-empty wins. */
export function abFromLineItems(order: Json): string | null {
  if (!Array.isArray(order.line_items)) return null;
  for (const li of order.line_items) {
    if (!isObject(li)) continue;
    const props = li.properties;
    if (Array.isArray(props)) {
      for (const p of props) if (isObject(p) && p.name === AB_KEY && nonEmpty(p.value)) return p.value.trim();
    } else if (isObject(props) && nonEmpty(props[AB_KEY])) {
      return (props[AB_KEY] as string).trim();
    }
  }
  return null;
}

export type AbSource = "CART_ATTRIBUTE" | "LINE_ITEM_PROPERTY";

/** Contract order: cart attribute → line item property. CUSTOMER_LOOKUP happens in attribution.server.ts when this is null. */
export function extractAbValue(order: Json): { value: string; source: AbSource } | null {
  const fromCart = abFromNoteAttributes(order);
  if (fromCart) return { value: fromCart, source: "CART_ATTRIBUTE" };
  const fromLine = abFromLineItems(order);
  if (fromLine) return { value: fromLine, source: "LINE_ITEM_PROPERTY" };
  return null;
}
