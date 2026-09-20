# ADR-0015: Order-Tracking: Webhooks `orders/create`, `orders/updated`, `refunds/create`

Datum: 2026-09-20 · Status: entschieden

## Kontext
Umsatz muss server-side, in Shop-Währung und inklusive Refunds und Stornos erfasst werden – client-side Conversion-Tracking ist unvollständig und manipulierbar.

## Entscheidung
Webhook-Subscriptions in `shopify.app.toml`; Handler persistieren das Event idempotent (`X-Shopify-Webhook-Id`), antworten 200 und verarbeiten inline; Fehler landen in `WebhookEvent.error`, `/jobs/retry-webhooks` holt sie stündlich nach. Geld immer aus `*_price_set.shop_money`.

## Alternativen
- Polling der Orders-API – Latenz, Rate Limits, keine Refund-Events.
- Queue (Redis o. ä.) – Betriebsaufwand für < 10 req/s ohne Nutzen.
- Checkout-Pixel für Conversions – kein Refund, keine Shop-Währung, Consent-abhängig.

## Konsequenzen
- Reconciliation (WP6) gegen Admin GraphQL fängt verlorene Webhooks am Folgetag.
- `read_orders` + PCD Level 1 nötig; Payload wird PII-gestrippt und schlank gespeichert (ADR-0024).
