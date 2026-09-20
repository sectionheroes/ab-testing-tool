# ADR-0019: Live-Daten: Zähler live per Query, `DailyStat` nur Historie

Datum: 2026-09-20 · Status: entschieden

## Kontext
Für QA und Notbremse braucht das Team aktuelle Zahlen (Visitors, Orders, Revenue, SRM) ohne auf einen Cron zu warten. Das statistische Urteil darf trotzdem nicht vorzeitig erscheinen.

## Entscheidung
Results-Zähler kommen aus einer Live-Aggregation über `Exposure ⨝ OrderAttribution ⨝ Order ⨝ Refund` (Auto-Refresh 60 s, Ziel < 500 ms bei 1 Mio. Exposures). `DailyStat` wird täglich materialisiert und dient nur Historie und Charts (Phase 2).

## Alternativen
- Alles aus `DailyStat` – Testbestellungen erscheinen erst am Folgetag; RPV-Varianz bräuchte Zusatzfelder (`revenueSumSq`).
- Streaming/Materialized Views – Betriebsaufwand für eine Person.

## Konsequenzen
- Indizes auf `(experimentId, variantId)`, `(orderId)`, `(experimentId, firstSeenAt)` sind Pflicht.
- Bei `ENDED` liest die Results-Seite nur noch den Snapshot (ADR-0025).
