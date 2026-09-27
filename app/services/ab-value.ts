// Pure. Contract 4.1: `_ab` = "<experiment_key>:<variant_key>[,<experiment_key>:<variant_key>...]", keys `^[a-z0-9-]+$`.
// Read from note_attributes first, then the first non-empty line_items[].properties[_ab]. Never change this format.

export const AB_KEY = "_ab";
/** Contract 4.1b – the visitor-binding attribute. Independent of `_ab`; never carries the variant. */
export const AB_VID_KEY = "_ab_v";
const PAIR = "[a-z0-9-]+:[a-z0-9-]+";
export const AB_VALUE_RE = new RegExp(`^${PAIR}(,${PAIR})*$`);
/**
 * UUID v4, as contract 4.1b requires at ingest: version nibble 4, variant nibble 8/9/a/b. Deliberately strict – the
 * value becomes `OrderAttribution.visitorId` and is joined against `Exposure.visitorId`, so anything a theme or an app
 * might have written into the cart under a colliding key has to fall out rather than create a phantom visitor.
 */
export const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
export function abFromNoteAttributes(order: Json, key: string = AB_KEY): string | null {
  if (!Array.isArray(order.note_attributes)) return null;
  for (const a of order.note_attributes) {
    if (isObject(a) && a.name === key && nonEmpty(a.value)) return a.value.trim();
  }
  return null;
}

/** line_items[].properties: either [{ name, value }] (webhook form) or { _ab: "…" } (cart.js form). First non-empty wins. */
export function abFromLineItems(order: Json, key: string = AB_KEY): string | null {
  if (!Array.isArray(order.line_items)) return null;
  for (const li of order.line_items) {
    if (!isObject(li)) continue;
    const props = li.properties;
    if (Array.isArray(props)) {
      for (const p of props) if (isObject(p) && p.name === key && nonEmpty(p.value)) return p.value.trim();
    } else if (isObject(props) && nonEmpty(props[key])) {
      return (props[key] as string).trim();
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

/**
 * Contract 4.1b: `_ab_v`, read in the same order as `_ab` – `note_attributes` first, then the first non-empty
 * line-item property. Returns null for anything that is not a UUID v4, and says where the value came from so a
 * mismatch between the two sources can be logged.
 *
 * There is no customer-lookup fallback here: `_ab_v` either travelled with the cart or it did not. An order without it
 * keeps `visitorId = null` and falls back to the ADR-0032 identity.
 */
export function extractVisitorId(order: Json): { value: string; source: AbSource } | null {
  const fromCart = abFromNoteAttributes(order, AB_VID_KEY);
  if (fromCart && VISITOR_ID_RE.test(fromCart)) return { value: fromCart.toLowerCase(), source: "CART_ATTRIBUTE" };
  const fromLine = abFromLineItems(order, AB_VID_KEY);
  if (fromLine && VISITOR_ID_RE.test(fromLine)) return { value: fromLine.toLowerCase(), source: "LINE_ITEM_PROPERTY" };
  return null;
}
