# ADR-0099: Shopify-Doku-Verifikation der Annahmen aus plan.md (WP0)

Datum: 2026-09-20 · Status: entschieden (Befund; Entscheidungen daraus trifft Joel)

## Kontext
plan.md §1, 4.4, 8.5 und WP-R beruhen auf Annahmen über Shopify. WP0 prüft sie mit dem Shopify Dev MCP (`search_docs_chunks`) gegen den Doku-Stand vom 20.09.2026 – nichts aus dem Gedächtnis. Quellen sind Seiten unter `https://shopify.dev/docs/…`.

## Entscheidung
Befund pro Item; §1 und §4 wurden **nicht** geändert, negative Befunde stehen in plan.md 8.5 und STATUS.md zur Entscheidung.

| Item | Ergebnis | Beleg |
|---|---|---|
| (a) Dev Stores ohne PCD-Approval | **pass** | `/docs/apps/launch/protected-customer-data`: "You don't need to submit a request for review for apps that are installed only on development stores." Aber: Daten und Felder müssen trotzdem im Partner Dashboard ausgewählt und die Data-Protection-Details ausgefüllt sein ("you can access customer data in development after Step 5"). |
| (c) Embedded App mit non-embedded Routen | **unclear** | Technisch nichts dagegen: `embedded = true` steuert nur, wo die App-URL lädt; Standalone-Apps existieren (`/docs/apps/build/authentication-authorization/id-tokens`). Review-seitig: Req. 2.2.2 "consistent embedded experience … any off-platform features integrated directly within the Shopify Admin" (`/docs/apps/launch/shopify-app-store/app-store-requirements`) und Ablehnungsgrund "app switches between embedded and not embedded versions" (`/docs/apps/launch/app-store-review/pass-app-review`). Unser Dashboard ist kein Merchant-Feature – Mitigation in WP-R-Checkliste. |
| (d) `_ab` im Admin sichtbar | **pass (Datenpfad), unclear (Admin-UI)** | `/docs/api/ajax/reference/cart`: `_`-Präfix bei Line Item Properties = "private" (nur im Storefront per Theme-Code versteckt, in Liquid/Ajax/Webhooks vorhanden); `__`-Präfix bei Cart Attributes wäre unsichtbar für Liquid und Ajax – unser `_ab` hat ein Unterstrich, ist also normal. Cart Attributes landen als `Order.customAttributes`/`note_attributes` (`/docs/api/storefront/2026-01/objects/Attribute`). Ob der Admin sie unter "Additional details" rendert, steht nicht auf shopify.dev → WP3-Abnahme prüft es auf dem Dev Store. |
| (e) `_shopify_y` | **fail** | Changelog 04.08.2025 (`/changelog/shopifyy-and-shopifys-cookies-will-no-longer-be-set`): "Starting on January 1st, 2026 Shopify will no longer set … `_shopify_y`." Ersatz ist `event.clientId` in Web Pixels – nur im Pixel-Sandbox, nicht im Theme-Script. `/docs/api/customer-privacy`: "Never read/modify any Shopify cookies directly". Option A aus 8.5 trägt nicht. |
| (f) `Set-Cookie` über App Proxy | **fail** | `/docs/apps/build/online-store/app-proxies`: "the following headers are stripped from app proxy responses: … Cookie … Set-Cookie". `/docs/apps/build/online-store/app-proxies/authenticate-app-proxies`: "App proxies don't support cookies". Option C aus 8.5 ist unmöglich. |
| (g) App-Review-Anforderungen | **pass mit Auflagen** | App-Bridge-Script + ID-Token Pflicht (Req. 1.1.1, 2.2.3); GraphQL-only für neue Public Apps seit 01.04.2025 (2.2.4); Install: OAuth sofort, Redirect auf UI, keine Domain-Eingabe (2.3.1–2.3.4); Screencast + Test-Credentials (4.5.3–4.5.5), Emergency Contact (4.5.6); Icon 1200×1200, Compliance-Webhooks Pflicht, PCD-Antrag **vor** Review ("Applying for protected customer data isn't possible while the app is under review", `/docs/apps/launch/app-store-review/submit-app-for-review`); Lighthouse ≤ 10 Punkte Verlust, gewichtet Home 17 / PDP 40 / Collection 43 (`/docs/apps/launch/shopify-app-store/best-practices`); Theme App Extension Pflicht, Embed default aus, keine Promotion im Storefront (`/docs/apps/build/online-store`, Changelog 23.10.2025). Aktivierungscode: nicht explizit geregelt; Built-for-Shopify 3.1.3 kennt die B2B-Ausnahme (`/docs/apps/launch/built-for-shopify/requirements`). "Embedded" ist damit de facto Pflicht für die Merchant-Seite – unsere Hybrid-Lösung erfüllt das; Rest siehe (c). Checkliste in plan.md WP-R. |
| (h) Compliance-Webhook-Fristen | **pass** | `/docs/apps/build/compliance/privacy-law-compliance`: sofort 2xx bestätigen, Aktion "within 30 days"; `customers/redact` kommt 10 Tage nach Antrag (seit 23.03.2026 ohne 6-Monats-Sperre, `/changelog/updated-handling-of-customer-data-erasure-requests-with-recent-orders`); `shop/redact` 48 h nach Uninstall; `customers/data_request` verlangt, die Daten dem Store Owner zu liefern → in WP2 ergänzt. |

## Konsequenzen
- Alternative "aus dem Gedächtnis beantworten" war ausgeschlossen – das hätte (e) übersehen.
- 8.5 ist wieder offen: A und C sind weg, B (HTTP-Cookie über Kunden-Subdomain) oder ein JS-Cookie mit 7-Tage-ITP-Risiko bleiben – Entscheidung Joel vor WP3; Vertrag 4.4 bleibt bis dahin unverändert.
- WP-R hat eine konkrete Checkliste; PCD-Antrag muss vor dem Einreichen gestellt sein.
- WP2 bekommt `customers/data_request`-Handling; WP3-Abnahme prüft die Admin-Sichtbarkeit von `_ab`.
