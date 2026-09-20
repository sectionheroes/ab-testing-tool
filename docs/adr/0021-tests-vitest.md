# ADR-0021: Tests: Vitest

Datum: 2026-09-20 · Status: entschieden

## Kontext
Ein Test-Runner für Stats (Monte-Carlo, Referenzbeispiele), Snippet (Bucketing, Targeting), Webhook-Fixtures und Service-Schicht.

## Entscheidung
Vitest als einziger Test-Runner, `pnpm test` läuft alle Ordner.

## Alternativen
- Jest – langsamer mit ESM/TS, zweite Config neben Vite.
- Node Test Runner – weniger Ökosystem (Mocks, Coverage).

## Konsequenzen
- Abnahme jedes WP = Tests grün + manuelle Prüfung auf dem Dev Store.
- A/A-Monte-Carlo (10 000 Läufe) muss in der Suite bleiben, Band 4–6 % wird nie erweitert.
