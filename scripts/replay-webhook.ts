// pnpm webhook:replay <fixture.json> [--shop <domain>] [--url http://localhost:3000] [--topic orders/create] [--id <webhook-id>]
// Signs a fixture with SHOPIFY_API_SECRET (HMAC-SHA256, base64) and POSTs it to the matching /webhooks/* route with a
// fresh X-Shopify-Webhook-Id – for the forced-error / retry / compliance acceptance tests (shop/redact only arrives
// 48 h after an uninstall in real life). Dev/test helper only.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const file = args[0];
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!file) {
  console.error("usage: pnpm webhook:replay <fixture.json> [--shop domain] [--url base] [--topic t] [--id webhook-id]");
  process.exit(1);
}
const secret = process.env.SHOPIFY_API_SECRET;
if (!secret) {
  console.error("SHOPIFY_API_SECRET not set (load .env)");
  process.exit(1);
}

// fixture name "orders-create.*.json" → topic "orders/create"
const topic = opt("topic") ?? basename(file).replace(/\.json$/, "").split(".")[0].replace("-", "/");
const shop = opt("shop") ?? "sh-ab-testing-one.myshopify.com";
const base = opt("url") ?? "http://localhost:3000";
const webhookId = opt("id") ?? randomUUID();
const body = readFileSync(file, "utf8");
const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");

const res = await fetch(`${base}/webhooks/${topic}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Webhook-Id": webhookId,
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-API-Version": "2026-07",
    "X-Shopify-Triggered-At": new Date().toISOString(),
  },
  body,
});
console.log(`${topic} → ${res.status} (shop ${shop}, webhook id ${webhookId})`);
