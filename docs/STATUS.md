# Status
Stand: 2026-09-20

## Aktuell
WP: WP0 – Vorbereitung · Branch: –

## Fertig
–

## In Arbeit
Doku-Grundgerüst: konzept.md, plan.md (v3.6), DESIGN.md, STATUS.md, ADR-Template. Kein Code, kein Repo.

## Blockiert
- PCD-Approval Level 1 – noch nicht beantragt (Joel, §7 im Plan)
- Offene Entscheidungen: 8.3 Zahlenformat und 8.4 Connection Pooling (vor WP1)
- App-Review ist Pflicht vor WP7 (WP-R, Einreichung nach WP3, Puffer 4 Wochen); WP0 (g) prüft, ob "embedded" zwingend ist
- `rahmen.md` fehlt noch

## Zuletzt geändert
- Plan v3.6: App Review als Pflicht (WP-R nach WP3), Install offen + Freischaltung per Allowlist/Aktivierungscode, hybrid embedded `/app` + non-embedded Dashboard, Fallback Custom-Distribution-App. Konzept: Nicht-Ziele, Risiko, §9 angepasst.
- Plan v3.5: 8.5 entschieden (`_shopify_y` als Visitor-ID, Fallback-Regel in 4.4), 8.6 entschieden (Retention-Regel).
- Plan v3.4: Review-Runde eingearbeitet – Google OAuth statt Firebase, Install-Allowlist, Dev-/Prod-App, PII-Strip, Visitor-ID immer Cookie + Login-Link, Consent entschieden, Vertrag 4.8 Zähl-Definitionen, fetch keepalive, Cart-Token-Merker, Rolle CLIENT, decision/conclusion, Sentry + Digest, Retry statt Queue; neu offen 8.5/8.6. Konzept: Kunde-Rolle, Cross-Device ab Phase 2, Risiko Dashboard-Zugriff.
- Plan v3.3: Hosting zurück auf Render Web Service (Starter, Frankfurt), Render Cron Jobs statt Cloud Scheduler, Firebase nur noch für Auth; §8.4 Empfehlung jetzt A (eine Instanz), B erst beim Skalieren
- Konzept: Live-Zähler statt "keine Echtzeit"; Notbremse als Hinweis, nicht Urteil; §7 Besucherzahl präzisiert (Shopify misst Sessions genauso im Browser)
- Plan v3.2: Results live per Query, `guardrail()` in lib/stats, DailyStat nur Historie
- Konzept neu geschrieben: Build-vs-Buy ehrlich, Nicht-Ziele, 10 geplante Tests, Datenqualitäts-Versprechen, Weggabelung intern/Public
- Plan auf v3.1: §0 Verweise auf rahmen.md/STATUS.md, §8.4 Connection Pooling (Empfehlung: Render PgBouncer), ADR-Format
- STATUS.md und docs/adr/ angelegt; altes Konzept v1 nach archiv/
