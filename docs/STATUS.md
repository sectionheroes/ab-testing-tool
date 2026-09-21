# Status
Stand: 2026-09-21

## Aktuell
WP: **WP1 abgenommen** (PR #1 squash-gemerged → `main` `4654ea2`) · Nächstes WP: WP2 (Datenmodell + Webhook-Ingestion), Branch `wp2-ingestion`

## Produktion (Render)
- Web Service `ab-testing-tool` (`srv-daoiugv40ujc73fgcljg`), **Node-Runtime** (kein Docker nötig), Frankfurt, Starter, Auto-Deploy `main`. URL: **https://ab-testing-tool-34of.onrender.com**, `/healthz` grün. Postgres `sh-abtesting-data` (`dpg-daoing8ae00c73cmaqt0-a`).
- Erster Deploy nach Merge war sofort live; `prisma migrate deploy` beim Start: „1 migration found … No pending migrations“ (Migration lag schon von lokal auf derselben DB).
- Einzige Änderung in Render: `TOKEN_ENCRYPTION_KEY` (und die restlichen Vars) waren eingetragen, aber nicht gespeichert/deployt → erste Prod-Anfrage 500 `TOKEN_ENCRYPTION_KEY is not set`; nach Speichern + manuellem Redeploy (`dep-daoqa8o0cd8s73ajqo40`) ok.
- Prod-App `sh-ab`: Version **sh-ab-4** released (`shopify app deploy --config prod`, Webhooks/Proxy/URLs aus `shopify.app.prod.toml`). Dev-App `sh-ab-dev` unverändert (`sh-ab-dev-2`, `app_url = https://example.com`). PCD Level 1 für beide Apps aktiv (Joel).
- **Prod-Webhook-Roundtrip:** Order #1001 (12,34 USD, Custom Item) auf Store one → `ORDERS_UPDATED` 21:48:03.830Z und `ORDERS_CREATE` 21:48:04.899Z in `WebhookEvent`, `processedAt` +2 ms, `error null`, HMAC via `authenticate.webhook`, **`payload = NULL`** (WEBHOOK_STORE_PAYLOAD in Render nicht `true`). Shopify Dev Dashboard → Monitoring → Webhooks: orders/create **413 ms**, orders/updated 211 ms Response Time, 0 % Failure; Handler laut Render-Log 30 ms. Kein Delivery-Timestamp mit Sekunden auf Shopify-Seite verfügbar (Timeline nur minutengenau, selbe Minute) – Abnahme < 5 s erfüllt über die gemessene Delivery-Dauer.
- Prod-App danach von Store one deinstalliert → `APP_UNINSTALLED` 21:50:20Z, `Shop.status = UNINSTALLED`, Token + Session `null`. Prod bleibt bis WP7 ohne Installation.

## Fertig (WP1)
- 8.5 entschieden: Visitor-ID Option D (ADR-0028, plan v3.8, Vertrag 4.4 geändert – einzige sanktionierte Vertragsänderung).
- Zwei UI-Welten (ADR-0029): `/app/*` = Polaris Web Components (`polaris.js` + `app-bridge.js` nur dort, `@shopify/polaris-types`), Rest DESIGN.md (Tailwind v4 + daisyUI 5). Lint-Regel `app/ui-split.test.ts` in `pnpm test`. Screenshots in `docs/screenshots/wp1/`.
- Configs `shopify.app.dev.toml` / `shopify.app.prod.toml`; Scopes `read_orders`; 8 Webhook-Routen; App Proxy `apps/sh-ab` → `/proxy`.
- Prisma: `Shop`, `User`, `UserShop`, `WebhookEvent`, `AuditLog`, Migration `20260921_wp1_init`, `max_connections = 103`.
- Install-Flow mit `ShopSessionStorage` (Token/Session AES-256-GCM), ALLOWLISTED→ACTIVE, PENDING + Aktivierungscode, Reinstall nach UNINSTALLED → ACTIVE wenn `activatedAt`. Google-Login (arctic, PKCE), Rollen-Guards. Webhook-Stubs idempotent + `stripPii()`. Sentry, `/healthz`, `render.yaml`, Dockerfile-Fallback.
- Abnahme-Belege im PR #1 (alle 7 Punkte pass).

## Bewusste Abweichungen / Notizen
- **Dev und Prod teilen sich dieselbe Render-DB** (lokales `.env` = externe Render-URL). Ein `Shop`-Row pro Domain – Store one ist jetzt `UNINSTALLED`, obwohl `sh-ab-dev` dort noch installiert ist; beim nächsten Öffnen der Dev-App läuft der Reinstall-Pfad (→ ACTIVE, `activatedAt` gesetzt). Vor WP7 klären: eigene DB für Prod oder `Shop` um `appClientId` erweitern.
- `assertEnv()` wird beim Boot nicht aufgerufen → fehlende Vars fallen erst bei der ersten Anfrage auf statt beim Deploy. In WP2 in `instrument.server.mjs`/Server-Entry einhängen.
- `WEBHOOK_STORE_PAYLOAD`: lokal `true`, in Render nicht gesetzt/`false` (verifiziert: Prod-Rows `payload NULL`). WP2 baut den Flag aus (ADR-0024).
- `WebhookEvent.topic` kommt vom SDK als Enum (`ORDERS_CREATE`); WP2 normalisiert oder übernimmt.
- App-Embed-Block-Handle ist `embed` (`APP_EMBED_HANDLE`) – WP3 muss `extensions/sh-ab-embed/blocks/embed.liquid` so benennen. Deep Link zeigt bis dahin „App embed does not exist“.
- Polaris Web Components in React 18: boolesche Props nie `{false}` (→ `"false"` = truthy), `x || undefined`. Enter im `<s-text-field>` submittet nicht, nur der Button.
- `prisma migrate dev` läuft nicht gegen Render (kein SUPERUSER) → `migrate diff --script` + `migrate deploy`.
- Lokal zwei Server: `pnpm dev --store <store>` (Tunnel; Preview gilt nur für den gewählten Store) + `pnpm dev:dashboard` (localhost:3000, einziger Google-Redirect). Cloudflare-Quick-Tunnel-DNS braucht manchmal Minuten oder einen Neustart.
- `stripPii()` ist WP1-Stand; WP2 vervollständigt mit Fixtures. Logo: Text-Wordmark.

## Offen
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g); `_ab`-Sichtbarkeit im Admin → WP3; Pseudonymisierung bei `shop/redact` juristisch offen (plan 8.6); PCD-Antrag (Review) vor WP-R.
