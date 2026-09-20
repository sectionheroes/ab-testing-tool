# ADR-0027: Alerts: Dashboard-Badges und Slack-Webhook (MISMATCH + täglicher Digest)

Datum: 2026-09-20 · Status: entschieden

## Kontext
rahmen.md (19.09.) wollte Slack streichen und nur im Dashboard warnen. Niemand öffnet das Dashboard täglich; Reconciliation fängt Webhook-Ausfälle erst am Folgetag – ein Frühwarnsystem braucht einen Push-Kanal, der ohnehin offen ist.

## Entscheidung
Beides: rote Badges im Dashboard (SRM p < 0,001, keine Exposures 24 h, Reconciliation-Abweichung > 2 %, Snippet-Fehler über Schwelle), aggregiert in der Shop-Übersicht – **und** ein Slack Incoming Webhook (plan.md §7) mit Nachricht bei jedem `MISMATCH` und einem täglichen Digest (fehlgeschlagene Webhook-Events, Snippet-Fehler pro Shop, Sentry-Fehleranzahl, neue `PENDING`/`ACTIVE`-Shops). Sentry bleibt für Server- und Snippet-Fehler.

## Alternativen
- Nur Dashboard – Ausfälle werden erst beim nächsten Login bemerkt.
- Nur Slack – kein Kontext beim Arbeiten im Dashboard.
- Uptime-Monitoring, On-Call, Log-Aggregation – nicht bauen (rahmen.md §8).

## Konsequenzen
- Ein Secret mehr (Slack-Webhook-URL), ein `fetch` im Reconcile-Job – keine Infrastruktur.
- Alerting-Regeln jenseits von Badge + Webhook bleiben tabu.
