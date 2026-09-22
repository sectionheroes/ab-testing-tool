# Status
Stand: 2026-09-22

## Aktuell
WP: **WP3 fertig** (3a Metafield-Config + Theme App Extension, 3b Snippet, 3c App-Proxy-Routen + Abnahme), Branch
`wp3-snippet`, PR gegen `main` offen. Nächste Session: **WP4** (Stats-Engine + A/A-Simulation). Parallel WP-R vorbereiten.

## Fertig (3c)
- `app/services/proxy.server.ts`: eigene App-Proxy-Signaturprüfung (ADR-0031), gegen **beide** Doku-Vektoren getestet
  (Secret `hush`, Shop `shop-name.myshopify.com` – die Doku rendert ihn als `{shop}`). 405 kein POST · 400 kein `shop` ·
  401 Signatur fehlt/falsch/älter als 5 min · 204 Shop unbekannt oder nicht ACTIVE (nichts gespeichert, Snippet setzt
  seinen Marker) · sonst Kontext. Body ≤ 4 KB, `proxyAction` antwortet nach erfolgreicher Auth **immer** 204, auch bei
  ungültigem Body oder Handler-Fehler (Fehler → Log + Sentry).
- `app/services/exposures.server.ts`: `recordExposure` (handgeschriebener Validator, `createMany` + `skipDuplicates` =
  ON CONFLICT DO NOTHING auf `(experimentId, visitorId)`), `linkVisitor` (setzt `customerId` nur wo null, überschreibt
  nie einen anderen, loggt das), `recordSnippetError` (Row + Sentry). `app/services/bots.server.ts`: `isbot` + die
  Snippet-Regex, fehlender UA = Bot.
- Zwei In-Memory-Drosseln (eine Instanz, rahmen §9): max. **500 SnippetError-Rows pro Shop und rollender Stunde**,
  darüber nur noch eine Log-Zeile; **ein Sentry-Event pro (Shop, Experiment, Message) je 10 min**.
- Neues Modell `SnippetError` (+ Index `(shopId, createdAt)`), Migration `20260922105444_wp3_snippet_error`.
  **Retention fehlt noch** – gehört in `/jobs/cleanup` (WP6), zusammen mit der Exposure-Retention.
- Routen `proxy.e.tsx`, `proxy.link.tsx`, `proxy.err.tsx` (POST, Loader 405), nicht unter `app.tsx` genestet.
- Shop-Detailseite: zwei zusätzliche read-only Tabellen – **Exposures** (Experiment/Variante, Visitors, Bots, Bot-Anteil)
  und **Snippet errors** (letzte 50). Nur DESIGN.md-Rezepte, Zahlen `de-DE`.
- Tests: 23 neue (189 gesamt, grün). Signaturvektoren, Timestamp-Fenster ±300 s, 405/400/401/204-Matrix, 4-KB-Body,
  Duplicate ignoriert, nicht-RUNNING ignoriert, `customerId` nur aus dem Proxy-Parameter, Bot-Flag, Link überschreibt
  nie, Sentry-Drossel, Row-Cap.

## Befunde 3c (wichtig für spätere WPs)
- **Kein Country.** App-Proxy-Requests bringen laut Doku nur `X-Forwarded-For` und `X-Forwarded-Host`, keinen
  Geo-Header. `Exposure.country` bleibt null. Wenn wir Land wollen: GeoIP über `X-Forwarded-For` (eigene Entscheidung,
  Datenschutz prüfen) oder Shopify-Localization aus dem Snippet mitschicken.
- **`_ab` ist im Admin sichtbar** – ADR-0099 (d) ist damit geschlossen: Order #1006 zeigt „Additional details: `_ab`
  demo-test:a" **und** die Line-Item-Property `_ab: demo-test:a`. konzept §7 bleibt wie versprochen.
- **Dev-Stores lassen keine Nicht-Test-Orders zu**: „You can only test orders using the Bogus Test gateway … You can't
  test orders using real transactions through active payment providers"
  (`/docs/storefronts/themes/tools/development-stores`). Die manuelle Zahlungsart (Bank Deposit) wird im Checkout
  blockiert („To place a test order, you'll need to use a test payment gateway"). Alle Abnahme-Orders haben deshalb
  `test = true`. Die 4.8-Regel „nur `test = false` zählt" ist durch Unit-Tests (WP2) gedeckt, end-to-end erst in WP7.
- Dieselbe Seite: **„You can't remove the password page"** – das Storefront-Passwort bleibt auf Dev-Stores an.
  Ein passwortfreier Lighthouse-Lauf ist erst auf dem echten Store in WP7 möglich.
- **Webhooks der Dev-App erreichen den CLI-Tunnel nicht.** App-Level-Subscriptions (TOML) werden gegen die
  application_url der *released* Version zugestellt; `shopify app dev` ändert daran nichts, und `webhookSubscriptions`
  (shop-level) ist leer. Für lokale Abnahmen gilt weiter der WP2-Weg: echte Payloads mit `pnpm webhook:replay` gegen
  `pnpm dev:dashboard` (:3000) einspielen – der CLI-Dev-Server signiert mit einem anderen Secret und antwortet 401.
- Offen aus ADR-0031: **Secret-Rotation**. Die Signaturprüfung kennt genau ein `SHOPIFY_API_SECRET`; für eine Rotation
  müssten übergangsweise zwei akzeptiert werden.

## Abnahme WP3 (sh-ab-testing-one, 22.09.2026)
| # | Item | Ergebnis |
|---|---|---|
| a | 10 Loads Home/PDP/Collection, frischer Visitor | **pass** – genau 1 Exposure (`44f15d3c…`, Variante a), Marker `_shab_exp:demo-test` nach dem ersten 204 |
| b | `?ab_force=demo-test:b` | **pass** – roter Preis `rgb(211,47,47)`, keine Hidden Inputs, Exposure-Zahl unverändert |
| c | Add to cart → Order → Admin | **pass** – Order #1006: `_ab: demo-test:a` als Order-Attribut *und* Line-Item-Property, im Admin unter „Additional details" sichtbar; lokal ingestiert → `CART_ATTRIBUTE` |
| d | Zweite Order nach Checkout | **pass** – neuer Cart-Token, Attribut sofort wieder gesetzt, Order #1007 gleiche Variante a → `CART_ATTRIBUTE` |
| e | Login-Link + `CUSTOMER_LOOKUP` | **pass** – `/proxy/link` setzt `Exposure.customerId` (`0 → 10442451222812`); Replay von #1008 ohne `note_attributes`/Properties mit Kunden-ID → `CUSTOMER_LOOKUP` |
| f | `/proxy/e` erzwungen 500 | **pass** – 2 Loads ohne Marker und ohne Row, nach dem Revert genau 1 Row, weitere Loads kein Duplikat |
| g | Consent (Pandectes) mit `requireConsent = true` | **pass** – vor Accept: kein `_shab_vid`, kein Exposure, Original; Decline: unverändert; nach Accept **ohne Reload** Variante b sichtbar + Exposure gesendet |
| h | Lighthouse Mobile PDP, 3× an / 3× aus | **verschoben auf WP7** – nicht durchführbar, Begründung unten |
| i | Bundle + Propagation | **pass** – 8.108 B raw / **3.505 B gzip** (43 % des 8-KB-Budgets); Propagation aus 3a: Edge 1–16 s, Origin 1–2 s |
| j | Snippet-Fehlerpfad | **pass** – `throw new Error("boom")` in b: Original gezeigt, CSS wieder entfernt, **kein** Exposure, `SnippetError`-Row, Sentry-Event `0cf8f41ffb544018a03e617ab592d80f`, Dashboard-Tabelle zeigt sie; JS wiederhergestellt |

**Item h – warum verschoben.** Dev-Stores können das Storefront-Passwort nicht abschalten
(`/docs/storefronts/themes/tools/development-stores`: „You can't remove the password page"). Damit braucht jeder
Lighthouse-Lauf den `storefront_digest`-Cookie, also das Passwort. Der Theme-Preview-Share-Link
(`*.shopifypreview.com`) umgeht das Gate **nicht** – auch er landet auf `/password` (am 22.09. mit einer Theme-Kopie
geprüft, Kopie danach gelöscht). Der Lauf gehört damit ohnehin dorthin, wo er aussagekräftig ist: **WP7, erster echter
Store, ohne Passwort**. Dort gilt weiter die Vorgabe aus plan.md/ADR-0099 (g): Performance-Delta ≤ 2 Punkte, je drei
Läufe mit und ohne App Embed, alle sechs Scores in STATUS. Zwischenstand aus 3b: CSS steht vor dem ersten Paint,
JS läuft bei DOMContentLoaded, Snippet 3.505 B gzip.

Consent-Tool: **Pandectes GDPR Cookie Consent** (Free), lädt `consent-tracking-api.js` selbst und bedient
`Shopify.customerPrivacy` nativ (`analyticsProcessingAllowed()` false vor Accept, true danach, Event
`visitorConsentCollected` ohne Reload). Die Entscheidung liegt im Cookie `_pandectes_gdpr`.

## 3a/3b (unverändert, Details in d50056e und a3fc449)
- `client-config.ts` + `metafields.server.ts` (AppInstallation, Namespace `sh_ab`, Guard 80 % von 128 KB),
  `experiments.server.ts` (Status/Code-Save → Sync). Extension `sh-ab-embed`, Block `embed`, Deep-Link ok.
- `lib/snippet` ohne Runtime-Dependencies, 27 Tests (FNV-1a-Vektoren, Verteilung 100 k IDs ±1 %, eingefrorener
  Referenzvektor, Targeting, Attribut-Builder, Marker-Regeln). Flicker gemessen: CSS immer vor dem ersten Paint;
  `hideUntilApplied=true` kostet ≈ 50 ms leere Seite und vermeidet das Nachrucken bei JS-Varianten.

## Offen
- Retention für `SnippetError` und `Exposure` in `/jobs/cleanup` (WP6).
- Secret-Rotation bei der Proxy-Signatur (ADR-0031).
- **Item h (Lighthouse) offen** – zusammen mit der `test = false`-Order nur auf einem echten Store möglich (WP7).
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g); Pseudonymisierung bei `shop/redact` (plan 8.6); PCD-Antrag vor WP-R.
- Prod-DB (Render) vor WP7 sauber neu aufsetzen; `Shop.appClientId` prüfen, falls Dev und Prod je in einer DB landen.
