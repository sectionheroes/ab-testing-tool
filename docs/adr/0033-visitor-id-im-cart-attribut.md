# ADR-0033: Die `visitorId` fährt als eigenes Cart-Attribut `_ab_v` mit

Datum: 2026-09-23 · Status: entschieden · **ersetzt ADR-0032**

## Kontext
ADR-0032 hat die Order-→-Visitor-Zuordnung als Näherung gelöst: eine Conversion ist eine *Identität*
(`Order.customerId`, sonst die Order selbst), weil nichts eine Order an eine `visitorId` bindet. Diese Näherung kostet
an drei Stellen Genauigkeit:

- **CR**: Mehrfachkäufe eines Gasts ohne `customerId` zählen mehrfach – bekannte Verzerrung nach oben (4.8 verlangt
  „ein Visitor konvertiert einmal").
- **Attributionsfenster**: Nicht verknüpfbare Orders nutzen `Experiment.startedAt` als Untergrenze statt des echten
  `Exposure.firstSeenAt`.
- **Device**: Orders bekommen ein Device nur, wenn sie über `Exposure.customerId` (Login-Link, 4.5) verknüpfbar sind.
  Für Gast-Orders gibt es keins. Der WP4-Lasttest hat die Größenordnung gemessen: **`deviceLinkRate` 31 %** – bei gut
  zwei Dritteln der Orders fehlt das Device (STATUS 23.09.).

Der dritte Punkt wurde bei der WP5-Planung zum Blocker: die Results-Seite soll nach Device filterbar sein (Joel,
23.09.), und eine Device-Aufteilung, in der Visitors exakt und Conversions weitgehend leer sind, ist als
Entscheidungsgrundlage unbrauchbar.

ADR-0032 hat „visitorId ins Cart-Attribut" als Alternative geprüft und mit „Vertragsänderung an 4.1, ausgeschlossen"
verworfen. **Das war ein Fehlschluss.** Vertrag 4.1 beschreibt genau einen Key (`_ab`) und dessen Format. Ein
zusätzlicher, eigener Key ändert weder das Format noch die Semantik von `_ab`; er ist eine Ergänzung, keine Änderung.
Die Zusage aus 4.1 („Phase 3: Shopify Functions lesen exakt dieses Attribut, deshalb ändert sich das Format nie")
bleibt unangetastet.

Geprüfte Alternativen für die Device-Quelle (Dev MCP, 23.09.2026):

- `client_details.user_agent` aus dem Order-Payload existiert (Top-Level-Key in `orders/create`, verifiziert gegen
  2026-07), ist aber Protected Customer Data. Nicht freigegebene Felder werden **stumm** auf `null` redigiert – die
  Device-Zahlen hingen damit an einer ausstehenden Shopify-Genehmigung und könnten jederzeit leer zurückkommen, ohne
  dass etwas sichtbar bricht.
- Web Pixel auf `checkout_completed` (vermutlich Shoplifts Weg – deren Docs legen den Mechanismus nicht offen) scheidet
  aus, weil wir Web Pixels bewusst nicht einsetzen (ADR-0012, Sandbox).

## Entscheidung
Das Snippet setzt zusätzlich zu `_ab` ein zweites Attribut:

```
Key:    _ab_v
Value:  <visitorId>        // die ID aus ADR-0028, unverändert
```

- Gesetzt über denselben Pfad und dieselbe Bedingung wie `_ab` (Vertrag 4.1: `POST /cart/update.js` bei Änderung von
  Wert oder Cart-Token) und zusätzlich als `<input type="hidden" name="properties[_ab_v]">` in jedem Add-to-Cart-Form.
- **Unterstrich-Präfix = private property** (Dev MCP verifiziert): versteckt vor Cart, Checkout, Kundenansicht sowie
  gedruckten und gemailten Belegen; sichtbar bleibt es im Admin, in der Admin API und in Order-Webhooks – genau wie
  `_ab` heute.
- Beim Ingest wird `_ab_v` gelesen (erst `note_attributes`, dann Line-Item-Properties, wie 4.1) und auf
  `OrderAttribution.visitorId` persistiert.
- Die Aggregation joint darüber direkt auf die `Exposure`: **Konverter = `COUNT(DISTINCT visitorId)`**, RPV pro echtem
  Visitor, Fenstergrenze aus dem echten `firstSeenAt`, Device aus `Exposure.device`.
- Bleibt `_ab_v` leer (Order ohne Cart-Kontakt, `CUSTOMER_LOOKUP`-Pfad), gilt weiter der Weg aus ADR-0032 als
  Fallback, und die Order landet im Bucket `unknown`.
- `byDevice` bekommt `unknown` als **vierten, sichtbaren Bucket**, damit sich die Device-Zeilen auf die Gesamtwerte
  summieren. Bisher fehlt er in `byDevice`; der Fehlbetrag wird nur experimentweit als `deviceLinkRate` /
  `ordersWithoutDevice` ausgewiesen, nicht pro Variante und Device.

## Alternativen
- **`_ab_d` mit dem Device statt der visitorId** – löst nur das Device-Problem und lässt die CR-Verzerrung und die
  falsche Fenstergrenze stehen. Gleiche Kosten, ein Bruchteil des Nutzens.
- **`client_details.user_agent`** – siehe Kontext: PCD-abhängig und scheitert stumm.
- **Web Pixel / Checkout-Extension** – widerspricht ADR-0012.
- **Status quo (ADR-0032)** – die Näherung bleibt korrekt gerechnet, aber ein Device-Filter wäre nicht seriös
  darstellbar.

## Konsequenzen
- Die CR-Verzerrung aus ADR-0032 verschwindet für alle Orders mit Cart-Kontakt; 4.8 („ein Visitor konvertiert einmal")
  wird erstmals wörtlich erfüllt. Die Kappung Konverter ≤ Visitors bleibt als Sicherheitsnetz bestehen.
- Device-Zahlen für Orders und Revenue werden für Gast-Orders korrekt. Die Device-Klasse ist die **des
  Expositions-Zeitpunkts**, nicht die des Checkouts – ein Gerätewechsel zwischen Browsing und Kauf erzeugt ohnehin
  einen neuen Visitor (die `visitorId` liegt pro Browser-Storage vor, ADR-0028).
- Die `visitorId` wird im Admin des Merchants sichtbar. Sie ist ein pseudonymer First-Party-Identifier ohne
  Personenbezug, den wir ohnehin in `Exposure` speichern. Kein PCD, kein zusätzliches Consent-Thema (das Snippet läuft
  bei `requireConsent` ohnehin erst nach Zustimmung, 4.5).
- Neues Feld `OrderAttribution.visitorId` (nullable, indiziert) – Migration. Ein Backfill entfällt: das Tool ist noch
  nicht live, es gibt keine Bestandsdaten.
- Snippet wächst um ein paar Bytes. Budget unkritisch (3.505 B von 8 KB gzip nach WP3).
- Die Device-Erkennung bleibt UA-Heuristik (`lib/snippet/src/env.ts`) und damit fehlbar – iPadOS meldet seit Version 13
  standardmäßig einen Desktop-UA. Wird in WP4.1 mit `navigator.maxTouchPoints` nachgeschärft.
- `unknown` bleibt als Bucket bestehen und wird im UI ausgewiesen – nicht als Migrationspfad, sondern als
  Datenqualitäts-Anzeige. Springt der Anteil im Betrieb, muss man das sehen.
- ADR-0032 ist damit ersetzt. Die dort beschriebene Identitäts-Logik bleibt als Fallback im Code und in den Tests.
