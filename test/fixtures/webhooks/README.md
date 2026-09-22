# Webhook fixtures

Real payloads captured from the dev store `sh-ab-testing-one` (API 2026-07) on 2026-09-22 via a temporary raw dump in the
webhook handler. The customer is a fake test customer (`shab-test@example.com`, "1 Test Street"); the capturing browser's
IP and user agent were replaced. Because the dev app has no Protected Customer Data approval, Shopify already redacts
email/name/address in these payloads – `orders-create.pii-full.json` is the cart-attribute order with every PII field
filled in the way a PCD-approved app receives it, so the `stripPii()` test has something to catch.

| File | Source |
|---|---|
| `orders-create.cart-attribute.json` | #1002, `_ab` cart attribute `demo-test:b` set via `/cart/update.js` |
| `orders-create.line-item-property.json` | #1003, Buy-Now style `properties[_ab] = demo-test:a` via `/cart/add.js` |
| `orders-create.no-attribute.json` | #1004, no attribute anywhere |
| `orders-create.multi-currency.json` | presentment currency ≠ shop currency (Market Germany/EUR) |
| `orders-create.pii-full.json` | synthetic – see above |
| `orders-updated.edit.json` | #1004 after an order edit (quantity 1 → 2, partially_paid) |
| `refunds-create.json` | $100 custom-amount refund on #1002 – `transactions[]` carry no `amount_set`, `order_adjustments[]` do |
| `customers-data_request.json`, `customers-redact.json`, `shop-redact.json` | compliance payloads after the Shopify docs, ids from the dev store |
