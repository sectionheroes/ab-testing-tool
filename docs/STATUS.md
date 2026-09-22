# Status
Stand: 2026-09-22

## Aktuell
WP: **WP3 Session 3b fertig** (Snippet), Branch `wp3-snippet`, noch kein PR – der kommt nach 3c. Nächste Session: **3c** (App-Proxy-Routen `/proxy/e`, `/proxy/link`, `/proxy/err` + volle WP3-Abnahme).

## Fertig (3b)
- `lib/snippet` (TypeScript, keine Runtime-Dependencies), `pnpm build:snippet` (esbuild, ES2018, IIFE, minified) → `extensions/sh-ab-embed/assets/shab.js`: **8.108 B raw, 3.505 B gzip (43 % vom 8-KB-Budget)**, Build bricht über 8.192 B gzip ab. Deployed als `sh-ab-dev-6`.
- Module in `lib/snippet/src`: `env` (Storage/Cookie/UA/UTM/UUID hinter try/catch), `visitor` (4.4/ADR-0028), `force`, `targeting`, `bucket` (FNV-1a, 4.4), `attribute` (4.1), `apply` (CSS sofort als `<style data-shab>`, JS via `new Function` bei DOMContentLoaded, hide/reveal 300 ms), `beacon` (fetch keepalive, Marker nur bei 2xx), `cart` (Attribut + Hidden Inputs + MutationObserver), `index` (Guards → Consent-Gate → run).
- Entscheidungen: URL-Targeting `exact` vergleicht nur den Pathname (Trailing Slash tolerant), `contains`/`regex` sehen Pathname + Search. Device per UA (`iPad|Tablet|Android(?!.*Mobile)` → tablet, `Mobi|iPhone|Android` → mobile, sonst desktop). „Applied“ = Apply-Pass hat nicht geworfen; bei JS-Fehler wird das `<style>` wieder entfernt, kein Exposure, kein Attribut, Fehler an `/err`. `hideUntilApplied` nur, wenn das Dokument noch parst (nach spätem Consent wird keine sichtbare Seite ausgeblendet). `visible`-Trigger: Selector fehlt → kein Exposure; kein IntersectionObserver → sofort. `?ab_force=off` ist komplett passiv (keine ID, keine Observer, kein Cart-Clear).
- Consent (8.2, Dev-MCP-verifiziert): `Shopify.loadFeatures([{name:"consent-tracking-api",version:"0.1"}], cb)` muss im Theme-Kontext geladen werden; dann `Shopify.customerPrivacy.analyticsProcessingAllowed()`; Event `visitorConsentCollected` (nur bei Änderung). Snippet lädt es selbst, wartet bei fehlendem `Shopify.loadFeatures` bis DOMContentLoaded.
- ESLint-Grenze (plan §2): `lib/**` darf nichts aus `app/` importieren, `app/**` nichts aus `lib/snippet` oder `lib/cli` (`no-restricted-imports`, geprüft: feuert).
- Tests `lib/snippet/test` (27): FNV-1a-Testvektoren, Determinismus (1.000 Runs), Verteilung 100.000 IDs ±1 % (50/50 und 20/30/50), Allocation 0,5 → 50 % ±1 % draußen, **eingefrorener Referenzvektor** (5 IDs × 3 Konfigurationen – jede Änderung an Hash/Input/Cut fällt hier durch), Targeting/Device, Attribut-Builder (Regex identisch zu `app/services/ab-value.ts`, bewusst dupliziert), Visitor-ID-Vorrang, Force, Marker nur bei 2xx, Cart-Marker-Regel. jsdom-Setup `lib/snippet/test/setup.ts` (Node ≥ 22 hat einen experimentellen `localStorage`-Getter, der jsdoms verdrängt).

## Abnahme 3b (sh-ab-testing-one, Passwortschutz an, Proxy-Routen fehlen → `/apps/sh-ab/*` antwortet 405, harmlos)
- Variante b: rote Preise (CSS) + Badge „shab: variant b“ (JS setzt `data-shab-variant`). 10 Reloads über Home/PDP/Collection: 10× `a`, gleiche `_shab_vid`. ✅
- Frische IDs (Cookie + LS gelöscht ≙ Inkognito): b, a, b, b, a – neue Zuteilung pro ID. ✅
- `?ab_force=demo-test:b` → b sichtbar (Preis `rgb(211,47,47)`), kein Hidden Input, kein Exposure-Marker, bleibt für die Session; `?ab_force=off` → Original, nichts injiziert. ✅
- Add to cart (Form-Submit an `/cart/add.js`): Line-Item-Property `_ab: demo-test:a` **und** `/cart.js` `attributes._ab = demo-test:a`; Marker `_shab_cart` = `{ t: <cart-cookie>, v }`. Hidden Input in beiden `form[action*="/cart/add"]`. ✅
- Exposure-Marker bleibt bei 405 leer (`_shab_exp:demo-test` = null), Link-Marker ebenso → nächster Load sendet erneut. ✅
- **Flicker** (FCP vs. DOMContentLoaded, PerformanceObserver, Pane sichtbar, echte b-Zuteilung, je 3 Loads): CSS steht immer vor dem ersten Paint (synchron im `<head>`) → CSS-Varianten flackern nie. JS läuft bei DCL: mit `hideUntilApplied=false` lag DCL in 2/3 Loads 0–38 ms **nach** FCP (ein reiner JS-Umbau kann kurz nachrucken); mit `hideUntilApplied=true` lag FCP in 3/3 Loads 42–56 ms **nach** DCL – kein Flicker, Kosten ≈ 50 ms leere Seite. Wie geplant.

## Was 3c braucht
- Shopify hängt an jeden App-Proxy-Request `shop`, `logged_in_customer_id`, `timestamp`, `signature` als Query an. **Der Server nimmt die Customer-ID aus `logged_in_customer_id`, nie aus dem Body** – `cid` im Body ist nur ein Hinweis. Signatur nach Shopify-Doku prüfen (Dev MCP).
- `POST /apps/sh-ab/e` (→ `/proxy/e`), `Content-Type: application/json`, keepalive: `{ v:1, e, var, vid, cid, url: pathname+search, dev: "mobile"|"tablet"|"desktop", ref: document.referrer|"", utm: {source,medium,campaign,…}|null, t: <unix seconds> }`. Idempotent auf (experiment, vid). **Antwort 2xx = Marker `_shab_exp:<key>` wird gesetzt**, alles andere → Resend beim nächsten Load. `204` reicht.
- `POST /apps/sh-ab/link`: `{ v:1, vid, cid }`, einmal pro Session (Marker `_shab_link` in sessionStorage, nur bei 2xx).
- `POST /apps/sh-ab/err`: `{ v:1, e, var, msg, stack (≤ 500 Zeichen), url }`, kein Marker. Bot-Flag server-side aus dem UA.
- Bis die Routen da sind: 405 – das Snippet ignoriert es. Storefront-Passwort ist noch an – für den Lighthouse-Lauf ausschalten (Online Store → Preferences), sonst misst man die Password-Seite.
- Testdaten auf store one: `demo-test` RUNNING (`hideUntilApplied=false`), Variante b = rote Preise + Badge. Kunde ist im Browser-Pane eingeloggt (`customerId` 10442451222812).

## 3a (erledigt, Details im Commit d50056e)
- Lokale DB `postgresql://joel@localhost:5432/sh_ab_dev`; Render = nur Prod, sauberer Neustart vor WP7. `client-config.ts` (pur) + `metafields.server.ts` (AppInstallation, Namespace `sh_ab`, ADR-0030; Guard 80 % von 128 KB; Größe geloggt) + `experiments.server.ts` (Status/Code-Save → Sync, Rollback bei Write-Fehler). Extension `sh-ab-embed`, Block `embed`, Deep-Link funktioniert.
- Propagation gemessen (Edge 1–16 s, Origin 1–2 s, Home langsamer als PDP), Size-Log 2.827 B bei 2,5 KB Code; `| json` escaped `<` → kein `</script>`-Ausbruch aus Varianten-JS.

## Befunde / Hinweise
- **Lokale .env hatte ein falsches `SHOPIFY_API_SECRET`** – Refresh der 1-h-Offline-Tokens scheiterte („Missing or invalid client secret“); via `shopify app dev` lief es nur, weil die CLI das echte Secret injiziert. Joel hat es aus dem Dev Dashboard korrigiert.
- `shopify app deploy` non-interaktiv: `--allow-updates` (released) oder `--no-release`; kein `--force`. Dev-Preview von `shopify app dev` überlagert die released Extension → im Theme-Editor „Clean dev preview“. Quick-Tunnel-DNS hängt manchmal → Dev-Server neu starten.
- `seed:experiment` setzt RUNNING ohne Sync → danach `pnpm sync:config`. `hideUntilApplied` ist auf RUNNING gesperrt (4.6) – zum Umschalten pausieren.
- `shopify.app.prod.toml` lokale Änderung (`include_config_on_deploy`) weiterhin uncommitted.

## Offen
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g); Pseudonymisierung bei `shop/redact` (plan 8.6); PCD-Antrag vor WP-R.
- Prod-DB (Render) vor WP7 sauber neu aufsetzen; `Shop.appClientId` prüfen, falls Dev und Prod je in einer DB landen sollen.
