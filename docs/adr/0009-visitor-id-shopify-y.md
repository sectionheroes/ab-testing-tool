# ADR-0009: Visitor-ID: `_shopify_y` mit Fallback `_shab_vid`

Datum: 2026-09-20 · Status: entschieden

## Kontext
Safari ITP kappt per JS gesetzte Cookies auf 7 Tage. Ein eigener JS-Cookie hält bei ~30 % des Mobile-Traffics keine 14 Tage – Wiederkehrer würden neu gebucketed. Shopifys Analytics-Cookie `_shopify_y` galt als per HTTP gesetzt und damit ITP-fest.

## Entscheidung
Visitor-ID nach Vertrag 4.4: (1) `_shab_vid`, (2) sonst `_shopify_y`, (3) sonst UUID v4; Ergebnis immer als `_shab_vid` geschrieben. `customer.id` ist Metadatum, nie Bucketing-Input.

## Alternativen
- B – HTTP-Cookie über Kunden-Subdomain (CNAME auf unseren Service) – pro Kunde DNS, Custom Domain + TLS, zweiter Endpoint.
- C – `Set-Cookie` über die App-Proxy-Response – von WP0 (f) zu prüfen.

## Konsequenzen
- Gleiche Besucher-Definition wie Shopify Analytics, keine DNS-Änderung pro Kunde – sofern `_shopify_y` existiert.
- **WP0-Verifikation negativ (ADR-0099 e/f):** `_shopify_y` wird seit 01.01.2026 nicht mehr gesetzt, `Set-Cookie` wird vom App Proxy gestrippt. Diese Entscheidung ist damit inhaltlich hinfällig; §1 und 4.4 bleiben unverändert, bis Joel neu entscheidet – dann ersetzt ein neues ADR dieses.
