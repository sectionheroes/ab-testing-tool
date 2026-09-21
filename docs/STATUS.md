# Status
Stand: 2026-09-21

## Aktuell
WP: WP1 – App-Skeleton · Branch: `wp1-skeleton` (PR → `main` offen) · Nächstes WP: WP2 (Datenmodell + Webhook-Ingestion)

## Fertig (WP1)
- 8.5 entschieden: Visitor-ID Option D (ADR-0028, plan v3.8, Vertrag 4.4 geändert – einzige sanktionierte Vertragsänderung). Bias-Notiz: Wiederkehrer > 7 Tage (Safari) verdünnen den Lift Richtung null, nie ein falscher Winner.
- Scaffold aus dem React-Router-Template, **Polaris komplett raus** (Pakete, Web Components, `polaris-types`); App-Bridge-Script nur auf `/app/*` (root.tsx). `grep -ri polaris build/` = 0 Treffer.
- Zwei Configs `shopify.app.dev.toml` / `shopify.app.prod.toml`, beide `config validate` valid; `pnpm dev` hart auf `--config dev`. Scopes nur `read_orders` (app-owned Metafields + Theme App Extension brauchen keinen weiteren). 8 Webhook-Routen (`orders/create|updated`, `refunds/create`, `app/uninstalled|scopes_update`, 3 Compliance-Topics), App Proxy `apps/sh-ab` → `/proxy`.
- Tailwind v4 + daisyUI 5, `app.css` 1:1 aus DESIGN.md, Shell (Sidebar/Header/Progress) Dark + Light, Platzhalter-Seiten, Login-Card.
- Prisma auf Render Postgres: `Shop`, `User`, `UserShop`, `WebhookEvent`, `AuditLog` (+ `Shop.session/scope/activatedAt`, s. u.). Migration `20260921_wp1_init`. **`max_connections = 103`** (Plan-Wert, Option A mit `connection_limit=10` passt).
- Install-Flow: eigene `ShopSessionStorage` (Shop-Row statt Template-`Session`-Tabelle, Token + Session AES-256-GCM via `TOKEN_ENCRYPTION_KEY`), ALLOWLISTED→ACTIVE, sonst PENDING; Reinstall nach UNINSTALLED → ACTIVE nur wenn `activatedAt` gesetzt. `afterAuth` liest `shop { name ianaTimezone }`. `/app`: PENDING = Aktivierungscode (timingSafeEqual, 5 Versuche/15 min), ACTIVE = Status + Theme-Editor-Deep-Link + Kontakt. 10 Unit-Tests für die Storage-Übergänge.
- Google-Login (arctic, PKCE), Session-Cookie 30 Tage, Zugangsregel (User existiert oder `@sectionheroes.de` → MEMBER), CLIENT-Guard auf `/dashboard/shops/:id/*`. ADMIN `hello@sectionheroes.de` per `pnpm seed:admin`.
- Webhook-Stubs: HMAC via `authenticate.webhook`, idempotent auf `X-Shopify-Webhook-Id`, `stripPii()` (inkl. `fulfillments`), `app/uninstalled` → UNINSTALLED + Token weg.
- Sentry (`@sentry/react-router` v10, `instrument.server.mjs`, `dataCollection.httpBodies=[]`, `userInfo=false`, `sendDefaultPii=false`), `/healthz` ohne DB, `render.yaml` (node 24.21.0, Frankfurt, Starter, alle Vars `sync: false`), Dockerfile als Fallback.
- Abnahme auf den Dev Stores (Belege im PR): one allowlisted → ACTIVE · two → PENDING → falscher Code abgelehnt → richtiger Code → ACTIVE · Google-Login ok · Order #1001 → `orders/create` in `WebhookEvent`, PII-frei · Uninstall → UNINSTALLED.

## Bewusste Abweichungen / Notizen
- **`WEBHOOK_STORE_PAYLOAD`**: lokal `true` (Payload-Inspektion auf dem Dev Store), in Render `false`. WP2 baut den Flag aus und speichert nur bei Fehler (ADR-0024).
- `WebhookEvent.topic` kommt vom SDK in Enum-Form (`ORDERS_CREATE`), nicht `orders/create` – WP2 normalisiert oder übernimmt.
- **App-Embed-Block-Handle ist `embed`** (`extensions/sh-ab-embed/blocks/embed.liquid`) – im Deep-Link fest verdrahtet (`APP_EMBED_HANDLE` in `shops.server.ts`); WP3 muss genau diesen Dateinamen verwenden.
- `stripPii()` ist WP1-Stand (Top-Level + `customer` → `{id}`); WP2 vervollständigt mit Fixtures.
- `prisma migrate dev` läuft nicht gegen Render (kein SUPERUSER) → Migrationen per `prisma migrate diff --script` erzeugen, `migrate deploy` anwenden (auch beim `pnpm start`).
- Lokal zwei Server: `pnpm dev` (Tunnel, Shopify) + `pnpm dev:dashboard` (localhost:3000, einziger Google-Redirect). Die Dev-Preview-URL des CLI gilt nur für den per `--store` gewählten Store.
- PCD (Protected Customer Data) muss auch für Dev Stores im Dev Dashboard **ausgewählt** sein, sonst lehnt Shopify die `orders/*`-Subscriptions ab – für `sh-ab-dev` erledigt, für `sh-ab` vor dem Prod-Test.
- Logo: Text-Wordmark, PNGs aus DESIGN.md §4 liegen nicht im Repo.

## Offen
- Render-Deploy + Prod-Webhook-Roundtrip (< 5 s): Service deployt nur `main` → nach Merge (oder Branch temporär im Render-Dashboard umstellen); dann `shopify app deploy --config prod` (freigegeben, wird angekündigt) und Install der Prod-App auf Store one.
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g) unverändert; `_ab`-Sichtbarkeit im Admin → WP3; Pseudonymisierung bei `shop/redact` juristisch offen (plan 8.6); PCD-Antrag vor WP-R.
