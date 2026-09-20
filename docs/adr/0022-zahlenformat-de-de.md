# ADR-0022: Zahlenformat: `de-DE` für Zahlen, Beträge und Daten bei englischem UI-Text

Datum: 2026-09-20 · Status: entschieden

## Kontext
Die UI ist Englisch (ADR-0005), Kunden und Beträge sind deutsch. `1,234.56 €` liest im Team und beim Kunden niemand flüssig.

## Entscheidung
Alle Zahlen, Beträge und Datumswerte über `Intl.NumberFormat` / `Intl.DateTimeFormat` mit Locale `de-DE` (`1.234,56 €`, `20.09.2026`), gebündelt in einer Format-Helper-Datei. UI-Text bleibt Englisch.

## Alternativen
- `en-GB`/`en-DE` – konsistent mit dem UI-Text, aber fremd für deutsche Beträge.
- Pro Nutzer umschaltbar – kein Bedarf in Phase 1, bleibt möglich, weil nur `Intl`-Aufrufe betroffen sind.

## Konsequenzen
- CLAUDE.md-Regel ("formatted de-DE") ist damit bestätigt.
- Gemischte Sprache (englische Labels, deutsche Formate) ist bewusst.
