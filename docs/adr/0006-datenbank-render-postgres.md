# ADR-0006: Datenbank: Render Postgres via Prisma, Region Frankfurt

Datum: 2026-09-20 · Status: entschieden

## Kontext
Das Tool braucht eine relationale DB für Orders, Exposures und Ergebnisse; Hosting liegt auf Render (ADR-0007).

## Entscheidung
Render Postgres in Frankfurt, Zugriff über Prisma. In Prod die interne URL (privates Netz), extern nur für lokale Entwicklung und Migrationen.

## Alternativen
- Supabase – zweiter Provider, war in v1 geplant und wurde in v2 verworfen.
- Eigene Postgres-Instanz – Betriebsaufwand für eine Person.

## Konsequenzen
- App und DB im selben Netz, kein SSL-Overhead intern.
- Render-Storage kann nur vergrößert, nie verkleinert werden – konservativ provisionieren; Retention (ADR-0024) begrenzt das Wachstum.
