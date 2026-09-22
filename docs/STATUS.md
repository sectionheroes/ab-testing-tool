# Status
Stand: 2026-09-22

## Aktuell
WP: **WP2 umgesetzt**, Branch `wp2-ingestion`, PR offen → `main`. Offen im PR nur noch die Multi-Currency-Fixture (braucht Markt Germany/EUR + Shopify Payments Test-Modus auf Store one, Joel richtet ein). Nächstes WP: WP3 (Metafield-Config, Theme App Extension, Snippet).

## Fertig (WP2)
- Prisma-Schema komplett (plan §3): Experiment, Variant, ExperimentResult, Exposure, Order, OrderLineItem, OrderAttribution, Refund, DailyStat, ReconciliationRun, ApiToken + Enums, `Decimal(12,2)`, Indizes `(experimentId,variantId)`, `(orderId)`, `(experimentId,firstSeenAt)`, `Exposure(customerId)`, `WebhookEvent(error)`. Migration `20260922_wp2_data_model` (via `migrate diff --from-schema-datasource` + `migrate deploy`), normalisiert nebenbei alte `topic`-Werte.
- Webhook-Pipeline: `handleWebhook` → `recordWebhookEvent` (ohne Payload) → `processWebhook` (Dispatcher, `webhook-processing.server.ts`) → `processedAt`. Fehler: `error`, `attempts++`, `payload = stripPii(body)`, trotzdem 200; fällt schon `recordWebhookEvent` (DB) → 500, Shopify retried. `WEBHOOK_STORE_PAYLOAD` ist weg. `normalizeTopic()` → `orders/create`-Form überall.
- Handler: orders/create (Order + LineItems + Attribution 4.1: note_attributes → line_items[].properties → CUSTOMER_LOOKUP über Exposure.customerId, Fenster `startedAt <= createdAt <= endedAt|∞`, kein Status-Filter), orders/updated (Geld/Status/LineItems neu, keine Attribution, unbekannte Order = no-op), refunds/create (eigene Row), customers/data_request (Export in `WebhookEvent.payload`), customers/redact, shop/redact (8.6), app/uninstalled, app/scopes_update.
- `stripPii()` rekursiv (`pii.ts`), `slimOrder()` Whitelist (`slim-order.ts`), `money.ts` (nur `shop_money`). Tests über alle Fixtures in `test/fixtures/webhooks/` (echte Dev-Store-Payloads, README dort).
- `/jobs/retry-webhooks` + `/jobs/cleanup` (POST, Header `X-Jobs-Secret`), noch ohne Cron (WP6). Cleanup lässt `customers/data_request`-Events mit Export stehen.
- Scripts: `pnpm seed:experiment <shop>` (RUNNING `demo-test` a/b), `pnpm webhook:replay <fixture> [--shop] [--url] [--topic]` (signiert mit `SHOPIFY_API_SECRET`).
- Shop-Detailseite: Read-only-Tabellen Orders + Webhook events (Screenshot `docs/screenshots/wp2/`). Bugfix nebenbei: `dashboard.shops.tsx` → `dashboard.shops._index.tsx`, sonst rendert die Detailroute nie (fehlender Outlet).
- `assertEnv()` läuft jetzt beim Boot (`entry.server.tsx`).

## Befunde / bewusste Abweichungen
- **DB war leer.** Beim Start dieser Session hatte die Render-DB weder `_prisma_migrations` noch Shop-/User-Rows (WP1-Daten weg, Ursache unbekannt – vermutlich Reset/Neuanlage). Baseline per `prisma migrate resolve --applied 20260921_wp1_init`, dann `migrate deploy`. Admin `hello@sectionheroes.de` neu geseedet, beide Dev Stores neu allowlisted/installiert.
- **Refund-Betrag:** `refunds/create` liefert in `transactions[]` nur `amount`+`currency` (Presentment), kein `amount_set`. Reihenfolge in `refundAmount()`: `transactions[].amount_set.shop_money` wenn vorhanden → Admin GraphQL `refund.totalRefundedSet.shopMoney` (Dev-MCP-validiert) → Summe aus `refund_line_items` + `refund_shipping_lines` − `order_adjustments` (Test gegen die echte Fixture: 100,00). Live auf dem Dev Store lief der GraphQL-Pfad.
- **Dev-Store-Payloads sind PII-redigiert** (keine PCD-Freigabe der Dev-App): kein email/name/address. Deshalb `orders-create.pii-full.json` als synthetische Voll-PII-Fixture für den `stripPii`-Test.
- Test-Orders vom Bogus Gateway haben `test: true` → `Order.isTest = true`; nach 4.8 zählen sie nicht. Für WP4-Tests auf dem Dev Store also `isTest` bewusst ignorieren oder echte Zahlung simulieren.
- `shop/redact` wird nur über `Shop.status !== UNINSTALLED` als „reinstalled“ erkannt; `installedAt` taugt nicht (wird beim Reinstall nicht neu gesetzt).
- `orders/updated` kommt regelmäßig **vor** `orders/create` → no-op, create bringt dieselben Totals.
- `shopify.app.prod.toml` hat eine unkommittierte lokale Änderung (`include_config_on_deploy` entfernt) – nicht Teil von WP2, liegen lassen bis Joel entscheidet.
- Dev-Preview pro Store: `pnpm dev --store <x>` bindet die Tunnel-URL an genau diesen Store; für den anderen Store neu starten. Quick-Tunnel-DNS braucht bis zu 2 min.
- Replays gegen den `shopify app dev`-Server bekommen 401 (CLI injiziert ein anderes Secret); `pnpm webhook:replay` gegen `pnpm dev:dashboard` (:3000) nutzen.

## Offen
- Multi-Currency-Fixture + Abnahmepunkt (wartet auf Markt/EUR auf Store one).
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g); Pseudonymisierung bei `shop/redact` juristisch offen (plan 8.6); PCD-Antrag vor WP-R.
- Dev/Prod teilen die DB – vor WP7 trennen oder `Shop.appClientId`.
