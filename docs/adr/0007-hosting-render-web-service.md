# ADR-0007: Hosting: Render Web Service (Starter, Frankfurt), Cron über Render Cron Jobs

Datum: 2026-09-20 · Status: entschieden

## Kontext
v3 hatte Firebase App Hosting vorgesehen, begründet mit Free-Quota. Kosten sind laut rahmen.md §4 nachrangig; Cold Starts, Cross-Cloud-Verbindung zur DB und ein zweiter Provider sprachen dagegen.

## Entscheidung
Render Web Service, Node-Runtime, Auto-Deploy aus GitHub, Region Frankfurt, Plan Starter ab WP1 (kein Free-Plan: schläft nach 15 min ein, Webhooks laufen in den Timeout). Cron über Render Cron Jobs auf secret-geschützte `/jobs/*`-Endpoints.

## Alternativen
- Firebase App Hosting – Cold Starts, zweite Plattform, Node-Pfad für React Router 7 nicht vorkonfiguriert.
- Render Free-Plan – Einschlafen wäre auf einem Dev Store der Normalfall.
- `node-cron` im App-Prozess – nur solange es genau eine Instanz gibt; Endpoints bleiben für manuelles Anstoßen.

## Konsequenzen
- Eine Plattform, ein Deploy, keine Cross-Cloud-Latenz.
- Starter = eine Instanz, kein Autoscaling; mehr Instanzen manuell, dann greift Pooling B (ADR-0023).
