# ADR-0018: Stats (MVP): Fixed-horizon – Two-proportion z-Test, winsorized Welch t-Test, Chi-Square SRM

Datum: 2026-09-20 · Status: entschieden

## Kontext
Das Urteil muss einfach, prüfbar und gegen veröffentlichte Beispiele reproduzierbar sein. Peeking ist das häufigste Problem in Agentur-Tests.

## Entscheidung
Two-proportion z-Test für CR, winsorized Welch t-Test (99. Perzentil) für RPV, Chi-Square SRM-Check (Alarm p < 0,001); Signifikanz nur nach geplanter Sample Size; A/A-Monte-Carlo als Test mit FPR 4–6 %; Referenz-Tests auf 4 Nachkommastellen vor jeder Testfunktion.

## Alternativen
- Sequential Testing (mSPRT) – erlaubt Peeking, aber komplexer und schwerer prüfbar; Phase 2.
- Bayesianische Auswertung – Prior-Diskussionen, für die Zielgruppe schwerer erklärbar.
- Bootstrap-CI für RPV – Phase 2, Rechenzeit.

## Konsequenzen
- Anti-Peeking ist UI-Regel: keine p-Werte vor `plannedSampleSize`.
- Jede Änderung an einer Testfunktion erhöht `STATS_VERSION` (Snapshot, ADR-0025).
