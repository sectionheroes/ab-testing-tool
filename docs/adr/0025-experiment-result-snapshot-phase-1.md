# ADR-0025: Ergebnis-Snapshot `ExperimentResult` in Phase 1, eingefroren bei ENDED, nie neu berechnet

Datum: 2026-09-20 · Status: entschieden

## Kontext
Testergebnisse müssen mindestens 2 Jahre abrufbar sein (härteste Anforderung in rahmen.md), Rohdaten verschwinden nach 12 Monaten (ADR-0024), und ein alter Report darf sich nach Änderungen an der Stats-Engine nicht ändern. `Variant` ist editierbar – ohne Kopie ist später nicht nachvollziehbar, was gemessen wurde.

## Entscheidung
Modell `ExperimentResult` (plan.md §3): versioniertes JSON mit Zahlen je Variante inkl. Device-Split, p-Werten, CIs, SRM, Auswertungsfenster, tainted Days, `statsVersion`, eingefrorener Kopie von Hypothese, Variantencode, Targeting, Allocation, Weights, Salt, Trigger, Laufzeit, Code-Änderungs-Markern sowie `decision`/`conclusion`. Wird einmal beim Übergang auf `ENDED` in derselben Transaktion geschrieben (WP5), Berechnung ist `evaluate()` (WP4). Beendete Experimente lesen nur den Snapshot. Screenshot je Variante: Phase 2.

## Alternativen
- Snapshot erst in Phase 2 (Learnings-DB) – jedes Phase-1-Experiment wäre nach 12 Monaten nicht mehr rekonstruierbar.
- Neuberechnung bei Bedarf – Zahlen ändern sich mit der Engine, Rohdaten fehlen irgendwann.
- Tagesverläufe und weitere Segmente mitspeichern – bewusst nicht: gefordert ist der Ausgang, nicht der Verlauf.

## Konsequenzen
- Der Snapshot überlebt `shop/redact` (plan.md 8.6); Pseudonymisierung des Shop-Bezugs ist juristisch offen.
- Kein "Recompute"-Button; Fehler in der Engine werden im nächsten Experiment sichtbar, nicht rückwirkend.
