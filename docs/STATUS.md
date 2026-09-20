# Status
Stand: 2026-09-20

## Aktuell
WP: WP0 – Vorbereitung · Branch: `main` · Nächstes WP: WP1 (blockiert durch die Checkliste unten)

## Fertig (WP0, Claude-Code-Teil)
- Repo-Baseline: `.gitignore`, `CLAUDE.md` (wörtlich aus plan.md §6), `.DS_Store` enttrackt
- `rahmen.md` mit `plan.md` v3.7 abgeglichen: Retention bestätigt, `ExperimentResult` + `taintedDays` in §3, `/jobs/cleanup` in WP6, 8.3 = de-DE, 8.4 = Option A, Slack bleibt, obsolete Punkte (Hosting, Firebase, DSGVO-Webhooks, `revenueSumSq`) raus
- ADR-0001…0027 (alle §1-Entscheidungen + Zahlenformat, Pooling, Retention, Snapshot, Tainted Days, Alerts), ADR-0099 (Doku-Verifikation)
- Shopify-Doku-Verifikation (a, c–h) per Dev MCP, Checkliste in plan.md WP-R

## Offen / Blockiert
- **8.5 Visitor-ID muss neu entschieden werden (Joel, vor WP3):** `_shopify_y` wird seit 01.01.2026 nicht mehr gesetzt, App-Proxy-Responses verlieren `Set-Cookie` (ADR-0099 e/f). Übrig: B (HTTP-Cookie über Kunden-Subdomain/CNAME) oder JS-Cookie mit 7-Tage-ITP-Risiko. §1 und Vertrag 4.4 bewusst unverändert.
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g, Req. 2.2.2): nicht belegbar, nur mitigierbar – Fallback Custom-Distribution-App steht.
- `_ab`-Sichtbarkeit im Admin nicht auf shopify.dev dokumentiert → WP3-Abnahme auf dem Dev Store.
- Pseudonymisierung bei `shop/redact` juristisch offen (plan.md 8.6, kein Task).
- PCD-Antrag muss **vor** der Review-Einreichung gestellt sein (nicht währenddessen möglich).

## WP1 braucht von Joel (Stand: nichts davon im Repo belegt – bitte abhaken)
- [ ] Render: Postgres (Frankfurt) angelegt, interne + externe URL, `max_connections` des Plans notiert
- [ ] Render: Web Service (Starter, Frankfurt) mit dem GitHub-Repo verbunden, Auto-Deploy `main`
- [ ] Partner Dashboard: zwei Apps `sh-ab-dev` und `sh-ab` (Public, unlisted), Client-IDs/Secrets
- [ ] Zwei Development Stores (einer allowlisted, einer für den Aktivierungscode-Test)
- [ ] Google Cloud: OAuth-Client (Web), Consent Screen "Internal"; Client-ID + Secret
- [ ] Sentry-Projekt (free), DSN
- [ ] Slack Incoming-Webhook-URL
- [ ] Entscheidung 8.5 (Visitor-ID) – spätestens vor WP3, gern vor WP1
- [ ] PCD Level 1 im Partner Dashboard für die Prod-App auswählen (Review-Antrag erst mit WP-R)
