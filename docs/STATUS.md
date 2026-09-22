# Status
Stand: 2026-09-22

## Aktuell
WP: **WP3 Session 3a fertig** (Metafield-Writer + Theme App Extension), Branch `wp3-snippet`, noch kein PR – der kommt nach 3c. Nächste Session: **3b** (lib/snippet, esbuild → `extensions/sh-ab-embed/assets/shab.js`), dann 3c (Proxy-Routen + volle WP3-Abnahme).

## Fertig (3a)
- **Lokale DB:** `.env` → `postgresql://joel@localhost:5432/sh_ab_dev` (Homebrew Postgres 17; ohne User im URL wirft Prisma P1010). `prisma migrate dev` läuft sauber, beide Migrationen applied, kein `migrate diff`-Workaround mehr. Admin geseedet, beide Dev Stores per `shopify app dev --store` neu installiert (Shop-Rows lokal ACTIVE), `demo-test` auf beiden geseedet. **Render-DB ist ab jetzt nur Prod**; die alten Dev-Shop-Rows dort bleiben unangetastet, die Prod-DB bekommt vor WP7 einen sauberen Neustart.
- `app/services/client-config.ts` (pur): `buildClientConfig` nach Vertrag 4.2 – nur RUNNING, sortiert nach Key (byte-identisch bei gleicher Eingabe), leere Code-Felder → `null`; `serializeClientConfig` mit Guard 80 % von 128 KB = 104.857 B (`ConfigTooLargeError`). 8 Tests.
- `app/services/metafields.server.ts`: `syncShopConfig(shopId)` schreibt `client` per `metafieldsSet` auf die **AppInstallation**, Namespace `sh_ab` (ADR-0030, Fußnote in plan 4.2 – `$app:sh_ab` wäre in Liquid nur als `app.metafields["$app:sh_ab"]` erreichbar, auf dem Dev Store nachgemessen). Nicht-ACTIVE Shops werden nie geschrieben. `ensureServerConfig` reserviert `server` = `{"v":1,"experiments":{}}` einmalig. Jede Schreibung loggt `[metafields] <shop> sh_ab.client: <bytes> B (<pct>% of 131072), n experiment(s)`. GraphQL per Dev MCP validiert.
- `app/services/experiments.server.ts`: `setExperimentStatus` (Transitions DRAFT→RUNNING, RUNNING↔PAUSED, →ENDED nur mit `decision`; `startedAt` beim ersten RUNNING, `endedAt` bei ENDED; DB-Rollback wenn der Metafield-Write scheitert; AuditLog `STATUS_CHANGED`) und `saveVariantCode` (4.6: auf RUNNING Hotfix mit `CODE_CHANGED_WHILE_RUNNING`, ENDED gesperrt). 8 Tests.
- Trigger: Aktivierung über `activateShop()` **und** über den ALLOWLISTED→ACTIVE-Übergang in `ShopSessionStorage` (Callback `onActivated`, dynamischer Import wegen Zirkularität) → `syncOnActivation` (best effort). Store two hat es live gemacht: `server: reserved`, `client: 47 B`.
- Scripts: `pnpm sync:config <shop>`, `pnpm experiment:status <shop> <key> <status> [decision]`, `pnpm variant:code <shop> <key> <variant> --js f --css f`.
- **Extension `extensions/sh-ab-embed`**: `blocks/embed.liquid` (Handle `embed`, `target: head`, exakt die vertragliche Zeile + synchrones `shab.js`; Theme-Check `ParserBlockingScript` bewusst per Kommentar deaktiviert), `assets/shab.js` Placeholder (loggt `window.__shab`), `shopify.extension.toml`. Deployed auf **sh-ab-dev** als Version `sh-ab-dev-5`. App Embeds sind plattformseitig standardmäßig aus (kein TOML-Flag nötig).

## Abnahme 3a (sh-ab-testing-one, Evidenz aus Session)
- RUNNING → Metafield enthält `demo-test`; PAUSED → `{"v":1,"requireConsent":false,"experiments":[]}` (Read-back via `currentAppInstallation.metafield`). ✅
- Deep-Link aus `shops.server.ts` aktiviert den Embed im Theme Editor (nach „Clean dev preview“ – die Dev-Preview von `shopify app dev` überlagert sonst die released Version). Storefront-`<head>` enthält `window.__shab = { config, customerId, shop }`, Placeholder loggt es. ✅
- Size-Log: 1 Experiment mit 2.480 B JS/CSS auf Variante b → **2.827 B (2,2 %)**. Liquid `| json` escaped `<` zu `<`, `</script>` im Varianten-JS kann nicht ausbrechen. ✅
- **Propagation** (Zeit von `metafieldsSet`-Return bis Storefront-HTML das neue JSON liefert, Poll 1 s, gleiche URL ohne Cache-Buster):

  | Run | Kontext | Home | PDP |
  |---|---|---|---|
  | 1 | anonym, RUNNING→PAUSED | 1,7 s | 2,4 s |
  | 2 | anonym, PAUSED→RUNNING | 12,4 s | 3,5 s |
  | 3 | anonym, RUNNING→PAUSED | 16,1 s | 5,0 s |
  | 4 | eingeloggt, PAUSED→RUNNING | 1,0 s | 1,5 s |
  | 5 | eingeloggt, RUNNING→PAUSED | 3,1 s | 1,6 s |
  | 6 | eingeloggt, PAUSED→RUNNING | 6,0 s | 8,2 s |

  Sekundär, cache-busted (`?_=rand`, Origin-Latenz): 0,8–1,6 s Home, 2,0–2,1 s PDP. **Alles weit unter 60 s**; der Edge-Cache hält alte HTML max. ~16 s. Einschränkung: der Storefront ist passwortgeschützt, alle Fetches trugen das `storefront_digest`-Cookie – eine echt cookielose Messung braucht den Passwortschutz aus.

## Befunde / Hinweise
- `shopify app deploy` kennt kein `--force`; non-interaktiv `--allow-updates` (mit Release) oder `--no-release`. Ein versehentlicher `--no-release`-Lauf hat Version `sh-ab-dev-3` unreleased erzeugt – harmlos.
- Quick-Tunnel-DNS: einmal 10 min nicht aufgelöst → Dev-Server neu starten statt warten.
- `onActivated` feuerte auf store two doppelt (zwei parallele `storeSession`-Aufrufe) → `server` zweimal „reserved“ (gleicher Wert, harmlos).
- `seed:experiment` setzt RUNNING direkt per Prisma, ohne Sync → danach `pnpm sync:config`.
- Storefront-Passwörter der Dev Stores sind gesetzt; für Lighthouse/Inkognito-Tests in 3c am besten ausschalten (Online Store → Preferences).
- `shopify.app.prod.toml` lokale Änderung (`include_config_on_deploy`) weiterhin uncommitted.

## Was 3b braucht
- `window.__shab = { config: <4.2-JSON | null wenn Metafield fehlt>, customerId: <number|null>, shop: "<x>.myshopify.com" }` steht vor `shab.js` im `<head>`; `shab.js` ist synchron (kein defer/async).
- Build-Ziel `extensions/sh-ab-embed/assets/shab.js` (`pnpm build:snippet` anlegen), danach `shopify app deploy --config dev --allow-updates` (fragen). Der Dev-Preview-Modus von `shopify app dev` liefert die Extension auch ohne Deploy – aber „Clean dev preview“ nicht vergessen, sonst sieht der Store die released Version nicht.
- Testdaten auf store one: `demo-test` RUNNING, Variante b hat ~2,5 KB Beispiel-JS/CSS (PDP price-above-title); für sichtbare CSS-Änderung per `pnpm variant:code` ersetzen.

## Offen
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g); Pseudonymisierung bei `shop/redact` (plan 8.6); PCD-Antrag vor WP-R.
- Prod-DB (Render) vor WP7 sauber neu aufsetzen; `Shop.appClientId` prüfen, falls Dev und Prod je in einer DB landen sollen.
