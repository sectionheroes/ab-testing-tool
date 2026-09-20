# ADR-0002: Dev-/Prod-Trennung: zwei Apps im Partner Dashboard

Datum: 2026-09-20 · Status: entschieden

## Kontext
`shopify app dev` überschreibt App-URL, Redirect-URLs, App Proxy und Webhooks der verlinkten App. Mit einer einzigen App bricht Prod bei jeder Dev-Session.

## Entscheidung
Zwei Apps (`sh-ab-dev`, `sh-ab`) mit zwei Configs `shopify.app.dev.toml` / `shopify.app.prod.toml`; `shopify app dev` läuft nie gegen Prod. Eine Datenbank bis WP7, danach eigene Dev-DB für lokale Entwicklung.

## Alternativen
- Eine App, Dev-Sessions nur nachts – unzuverlässig, Prod-Ausfälle bei jedem Tunnel-Start.
- Getrennte Partner-Organisationen – mehr Verwaltung, kein Mehrwert.

## Konsequenzen
- Zwei Sets Credentials, PCD-Antrag nur für die Prod-App.
- Ab dem ersten Kunden-Shop ist eine zweite Postgres-Instanz oder Docker-Postgres Pflicht.
