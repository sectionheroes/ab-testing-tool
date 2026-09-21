# ADR-0028: Visitor-ID: JS-Cookie `_shab_vid` mit localStorage-Spiegel (Option D)

Datum: 2026-09-21 · Status: entschieden · ersetzt ADR-0009

## Kontext
ADR-0009 setzte auf Shopifys Analytics-Cookie `_shopify_y` als ITP-feste Visitor-ID. Die WP0-Verifikation (ADR-0099 e/f) hat die Basis widerlegt: Shopify setzt `_shopify_y` seit 01.01.2026 nicht mehr, der Ersatz `clientId` existiert nur im Web-Pixel-Sandbox, und App-Proxy-Responses verlieren `Set-Cookie` (Option C unmöglich). Übrig blieben B (HTTP-Cookie über eine Kunden-Subdomain per CNAME) und ein rein clientseitiger Weg. Entscheidung durch Joel am 21.09.2026.

## Entscheidung
Option D. `visitorId` wird im Snippet so bestimmt: (1) Cookie `_shab_vid`, falls vorhanden; (2) sonst `localStorage["_shab_vid"]`, falls vorhanden; (3) sonst neue UUID v4. Bei **jedem Page Load** werden Cookie und localStorage mit dem Ergebnis neu geschrieben – Cookie mit 365 Tagen, `SameSite=Lax`, `Path=/`. `_shopify_y` wird nirgends mehr gelesen. `customer.id` bleibt Metadatum (4.5), nie Bucketing-Input.

Effekt unter Safari ITP: Die 7-Tage-Kappung für script-writable Cookies und Storage läuft bei jedem Besuch neu an. Nur Besucher, die länger als 7 Tage nicht im Shop waren, bekommen eine neue ID.

## Alternativen
- B – HTTP-Cookie über Kunden-Subdomain (CNAME auf unseren Service) – ITP-fest, kostet aber pro Kunde DNS-Änderung, Custom Domain + TLS auf Render und einen zweiten Endpoint außerhalb des App-Proxys. Widerspricht `rahmen.md` §5 (ein Betreiber, langweilige Variante) für einen Randfall.
- C – `Set-Cookie` über die App-Proxy-Response – von Shopify gestrippt (ADR-0099 f), unmöglich.
- A – `_shopify_y` – wird nicht mehr gesetzt (ADR-0099 e).

## Konsequenzen
- Keine Infrastruktur pro Kunde; das Snippet bleibt in sich geschlossen. Vertrag 4.4 wurde entsprechend geändert – die einzige sanktionierte Vertragsänderung, weil ihre Grundlage nicht mehr existiert.
- **Akzeptierter Bias:** Wiederkehrer nach > 7 Tagen (Safari) werden neu gebucketed und zählen als neuer Visitor. Landet so jemand in der anderen Variante, verdünnt das den gemessenen Lift Richtung null (Kontamination beider Arme mit Besuchern, die schon die jeweils andere Variante gesehen haben). Ein falscher Winner kann daraus **nicht** entstehen: Orders tragen über das Cart-Attribut (4.1) immer die Variante, die beim Kauf tatsächlich gesehen wurde. Das Tool misst also konservativ.
- Die Größe des Effekts hängt vom Safari-Anteil und der Wiederkehr-Frequenz des Shops ab; sie ist nicht messbar, sondern nur abschätzbar. Wer sie kleiner haben will, muss B nachrüsten – die Snippet-Regel ist dafür der einzige Berührungspunkt.
