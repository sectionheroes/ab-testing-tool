# ADR-0016: Attribution: Cart Attribute `_ab` primär, Line Item Property `_ab` als Fallback, Customer-Lookup als dritter Weg

Datum: 2026-09-20 · Status: entschieden

## Kontext
Eine Order muss server-side der Variante zugeordnet werden, auch bei Buy Now / Shop Pay (Cart wird umgangen) und bei eingeloggten Kunden ohne Attribut.

## Entscheidung
Format `<experiment_key>:<variant_key>[,…]` (Vertrag 4.1), sortiert, nur `RUNNING`-Experimente mit tatsächlichem Bucketing. Gesetzt per `/cart/update.js` (Merker an Cart-Token gekoppelt) und als Hidden Input `properties[_ab]` in jedes Add-to-Cart-Formular. Server: `note_attributes` → `line_items[*].properties` → `Exposure.customerId`-Lookup; Quelle in `OrderAttribution.source`.

## Alternativen
- Nur Cart Attribute – Buy Now / Shop Pay verliert die Zuordnung.
- Visitor-ID in der Order – nicht vorhanden; Cookie erreicht den Checkout nicht.
- Attribution allein über Exposure-Zeitfenster – nicht deterministisch.

## Konsequenzen
- Phase 3: Shopify Functions lesen exakt `cart.attribute("_ab")` – das Format ändert sich nie.
- Sichtbarkeit von `_ab` im Admin ist Teil des Kundenversprechens; `__`-Präfix wäre unsichtbar und ist deshalb tabu (ADR-0099 d).
