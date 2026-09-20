# ADR-0024: Retention: Payload nur bei Fehler, WebhookEvent 30 Tage, Exposure 12 Monate, Order.raw schlank

Datum: 2026-09-20 · Status: entschieden

## Kontext
Volle Webhook-Payloads wären ~86 GB/Jahr, `Order.raw` ~16 GB/Jahr; Render-Storage kann nie verkleinert werden. `Exposure` enthält Personenbezug und braucht eine Frist. Ergebnisse müssen trotzdem ≥ 2 Jahre abrufbar sein.

## Entscheidung
`WebhookEvent.payload` nur bei Verarbeitungsfehler (PII-gestrippt), `WebhookEvent`-Zeilen nach 30 Tagen gelöscht; `Exposure` nach 12 Monaten gelöscht; `Order.raw` ist die Whitelist aus rahmen.md 3.1 (~4 KB); `Order`/`OrderLineItem`/`Refund`/`DailyStat`/`AuditLog`/`ExperimentResult` dauerhaft. Löschung per `/jobs/cleanup` (Render Cron Job, täglich).

## Alternativen
- Alles dauerhaft speichern – 100+ GB/Jahr, DSGVO-Risiko, sieht niemand an.
- Volle Payloads mit kurzer Frist – Debugging-Wert gering, Payload ist per Admin API nachladbar.
- Exposure kürzer als 12 Monate – Nachrechnungen im ersten Jahr unmöglich.

## Konsequenzen
- Langzeit-Ergebnis hängt am Snapshot (ADR-0025), nicht an den Rohdaten.
- `customers/data_request` kann nur liefern, was noch da ist (max. 12 Monate Exposures).
