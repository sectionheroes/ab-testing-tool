# ADR-0026: Tainted-Day-Regel in Phase 1 als manuelles Flag `Experiment.taintedDays`

Datum: 2026-09-20 · Status: entschieden

## Kontext
rahmen.md 7.2: Ingestion-Lücke > 30 min oder Verlust > 2 % der erwarteten Exposures → Tag aus dem Auswertungsfenster nehmen. Eine automatische Erkennung braucht Erwartungswerte und einen Detektor – Overengineering für Phase 1.

## Entscheidung
`Experiment.taintedDays` (Liste von Datumswerten) wird im Dashboard manuell gesetzt (WP5); `stats.server` schließt Exposures dieser Tage (in `Shop.timezone`) samt ihren Orders aus (WP4); Report und Snapshot zeigen die ausgeschlossenen Tage. Auslöser sind Sentry, der Badge "keine Exposures 24 h" und der Slack-Digest. Automatische Erkennung: Phase 2.

## Alternativen
- Automatische Erkennung jetzt – Erwartungswert-Modell, Fehlalarme, mehr Code als das Feature wert ist.
- Keine Tainted-Regel – ein Deploy-Ausfall verzerrt ein 14-Tage-Experiment stillschweigend.

## Konsequenzen
- Disziplin nötig: Wer den Ausfall sieht, trägt den Tag ein; AuditLog hält es fest.
- Sample-Size-Fortschritt und Laufzeit rechnen ohne die markierten Tage.
