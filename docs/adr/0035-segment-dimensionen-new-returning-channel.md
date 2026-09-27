# ADR-0035: Segment-Dimensionen im Report – Device, Visitor-Typ, Channel

Datum: 2026-09-23 · Status: entschieden

## Kontext
Die Results-Seite bekommt nach Shoplift-Vorbild eigene Tabs für Devices, Visitors und Channels (Joel, 23.09.). Die drei
Dimensionen sind unterschiedlich weit vorbereitet:

- **Device** – `Exposure.device` existiert seit WP3; Orders bekommen es über ADR-0033.
- **Channel** – `Exposure.referrer` und `Exposure.utm` werden seit WP3 bei jeder Exposure geschrieben (Vertrag 4.5),
  aber nie ausgewertet. Es fehlt nur die Klassifikation.
- **Visitor-Typ (new / returning)** – **fehlt vollständig.** Eine `Exposure` entsteht erst beim Eintritt ins
  Experiment; ob der Besucher den Shop vorher schon gesehen hat, weiß niemand.

Für den Visitor-Typ gibt es genau eine Stelle, an der die Information ohne Zusatzaufwand vorliegt: `getVisitorId()`
(`lib/snippet/src/visitor.ts`) weiß, ob die ID aus Cookie bzw. localStorage kam oder gerade erzeugt wurde. Das
weiterzureichen heißt, **Vertrag 4.5 (Exposure-Payload) zu ändern** – anders als bei ADR-0033, wo ein *neuer* Key
neben einen bestehenden trat. Joel hat der Änderung am 23.09. ausdrücklich zugestimmt.

## Entscheidung
Drei Segment-Dimensionen, definiert in Vertrag 4.10, ausgewertet über eine gemeinsame
`breakdown(experiment, dimension, opts)`-Query:

- **Device**: `mobile` · `desktop` · `tablet` · `unknown`, aus `Exposure.device`.
- **Visitor-Typ**: `new` · `returning`. Vertrag 4.5 bekommt das Feld `n` (boolean): `true`, wenn beim Page Load weder
  Cookie noch localStorage eine gültige `_shab_vid` enthielten, die ID also in diesem Moment erzeugt wurde.
  Persistiert als `Exposure.isNewVisitor`.
- **Channel**: abgeleitet aus `Exposure.referrer` und `Exposure.utm`, **zum Zeitpunkt der Exposition** (Last Touch),
  Gruppen nach Vertrag 4.10. Reine Ableitung, keine neue Datenerhebung.

Alle drei fallen unter ADR-0034: Rohzahlen, Raten und Improvement ja – p-Wert, CI, Signifikanz, Winner nein. Das
Improvement-Badge erscheint erst ab **100 Visitors und 25 Conversions pro Arm** im jeweiligen Segment, darunter steht
ein Strich.

## Alternativen
- **Visitor-Typ aus der Shopify-Kundenhistorie** (Erst- vs. Wiederkäufer) – misst etwas anderes (Kauf- statt
  Besuchshistorie), liegt nur für eingeloggte Kunden vor und wäre Protected Customer Data. Verworfen.
- **Kein Visitor-Tab** – wäre der einzige Weg, 4.5 unangetastet zu lassen. Joel hat dagegen entschieden, der Nutzen
  überwiegt.
- **Channel aus Shopifys eigener Attribution** (`Order.customerJourneySummary`) – wäre konsistent mit Shopify
  Analytics, liegt aber nur für Orders vor, nicht für Visitors. Ohne Nenner kein Channel-Report. Verworfen.
- **Cross-Filter zwischen den Dimensionen** (Shoplift kann Channel × Device × Visitor-Typ) – 3 × 2 × 8 Kombinationen
  mit überwiegend zweistelligen Fallzahlen. Für Phase 1 verworfen: jeder Tab filtert nur seine eigene Dimension plus
  Datum.

## Konsequenzen
- **Vertrag 4.5 ändert sich** – die zweite sanktionierte Vertragsänderung nach 4.4 (ADR-0028). Das Feld ist optional;
  ein Snippet ohne `n` erzeugt `isNewVisitor = null`, die Auswertung zeigt solche Exposures als `unknown`.
- „new" heißt **neu im Shop**, nicht neu im Test, und stützt sich auf Browser-Storage: Inkognito, gelöschte Cookies
  und ein Gerätewechsel zählen als neu. Dieselbe Einschränkung nennt Shoplift ausdrücklich. Gehört in den Tooltip.
- Die Channel-Zahlen weichen von Shopify Analytics ab (anderer Attributionszeitpunkt, anderes Modell). Muss unter der
  Tabelle stehen, nicht in einer FAQ.
- Die Aggregation braucht eine **generische** Breakdown-Query statt drei bzw. vier spezieller. Fließt in WP4.1 ein.
- Neue Spalte `Exposure.isNewVisitor` (nullable Boolean) und ein Index für die Breakdown-Query. Kein Backfill: das Tool
  ist noch nicht live.
- Die Channel-Klassifikation ist Code, kein gespeicherter Wert. Ändert sich die Regel, ändern sich alte Reports mit –
  außer bei beendeten Experimenten, die aus dem eingefrorenen Snapshot lesen (ADR-0025). Das ist gewollt.
