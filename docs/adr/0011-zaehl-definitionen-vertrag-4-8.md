# ADR-0011: Zählung: Vertrag 4.8 als verbindliche Definition von Visitor, Order, CR, RPV, AOV

Datum: 2026-09-20 · Status: entschieden

## Kontext
Ohne feste Definitionen rechnet jede Session anders: Was ist ein Visitor, welche Orders zählen, wo endet das Attributionsfenster, worauf fällt das Urteil.

## Entscheidung
Vertrag 4.8: Visitor = Exposure ohne Bot; Order zählt, wenn über `orders/create`, `source_name` weder `pos` noch `shopify_draft_order`, `test = false`, nicht storniert; CR auf konvertierende Visitors; RPV winsorized am 99. Perzentil; AOV auf Order-Basis; Tagesgrenzen in `Shop.timezone`; Urteil nur auf der Primärmetrik, Bonferroni bei > 2 Varianten.

## Alternativen
- Orders je Visitor als Conversion zählen – verletzt die Binomialannahme des z-Tests.
- Alle Orders inkl. POS/Draft – nicht vom Test beeinflussbar, verrauscht das Ergebnis.
- Urteil auf mehreren Metriken – Multiple-Comparison-Problem.

## Konsequenzen
- Stats-Engine, Dashboard, Reconciliation und Snapshot rechnen identisch.
- Änderungen an 4.8 sind Vertragsänderungen und brauchen Joel.
