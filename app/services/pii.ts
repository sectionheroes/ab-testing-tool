// Pure. Removes customer PII from any Shopify webhook payload before it is persisted (plan WP2, ADR-0024).
// Runs recursively: nested addresses (fulfillments[].destination, refunds, customer.default_address, …) go too.

/** Keys dropped wherever they appear. `customer` is special-cased to `{ id }`. */
const STRIP_KEYS = new Set([
  "billing_address",
  "shipping_address",
  "email",
  "contact_email",
  "phone",
  "note",
  "client_details",
  "payment_details",
  "browser_ip",
  "destination", // fulfillments[].destination
  "default_address",
  "sms_marketing_consent",
  "email_marketing_consent",
]);

/** Any object key ending in `_address` (billing_address, shipping_address, default_address, origin_address, …). */
const ADDRESS_SUFFIX = /_address$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (STRIP_KEYS.has(key) || ADDRESS_SUFFIX.test(key)) continue;
    if (key === "customer") {
      out.customer = isPlainObject(v) && v.id !== undefined ? { id: v.id } : null;
      continue;
    }
    out[key] = strip(v);
  }
  return out;
}

export function stripPii<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  return strip(payload) as Record<string, unknown>;
}

/**
 * Test helper (also usable as a guard): every key path in `value` that looks like PII.
 * Used by the fixture tests – the list is deliberately broader than STRIP_KEYS so a new leak is caught.
 */
const PII_KEYS = new Set([
  "email",
  "contact_email",
  "phone",
  "first_name",
  "last_name",
  "address1",
  "address2",
  "zip",
  "city",
  "province",
  "latitude",
  "longitude",
  "browser_ip",
  "user_agent",
  "accept_language",
  "billing_address",
  "shipping_address",
  "default_address",
  "client_details",
  "payment_details",
  "note",
  "destination",
  "customer_locale_name",
]);

export function findPiiKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findPiiKeys(v, `${path}[${i}]`));
  if (!isPlainObject(value)) return [];
  const found: string[] = [];
  for (const [key, v] of Object.entries(value)) {
    const p = path ? `${path}.${key}` : key;
    if (PII_KEYS.has(key) || ADDRESS_SUFFIX.test(key)) found.push(p);
    // customer may only ever be { id }
    if (key === "customer" && isPlainObject(v)) {
      for (const k of Object.keys(v)) if (k !== "id") found.push(`${p}.${k}`);
      continue;
    }
    found.push(...findPiiKeys(v, p));
  }
  return found;
}
