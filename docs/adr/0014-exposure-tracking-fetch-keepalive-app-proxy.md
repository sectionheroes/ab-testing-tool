# ADR-0014: Exposure-Tracking: `fetch keepalive` an den App Proxy, Merker erst bei 2xx

Datum: 2026-09-20 · Status: entschieden

## Kontext
Exposures müssen first-party, ad-blocker-resistent und ohne stummen Verlust bei 5xx erfasst werden. Ein Visitor zählt einmal pro Experiment.

## Entscheidung
`POST /apps/sh-ab/e` per `fetch(…, { keepalive: true })` mit Payload nach 4.5, nur nach erfolgreichem Anwenden der Variante (bzw. `visible`-Trigger). Der `localStorage`-Merker wird erst bei 2xx gesetzt; bei Fehler wird beim nächsten Page Load erneut gesendet, der Server ist idempotent (`ON CONFLICT DO NOTHING`).

## Alternativen
- `navigator.sendBeacon` – kein Response-Status, Fehler unsichtbar und endgültig.
- Web Pixel App Extension – Sandbox, keine DOM-Manipulation, Variante und Exposure wären getrennt.
- Externer Tracking-Endpoint – Ad-Blocker, Third-Party-Cookies.

## Konsequenzen
- Jeder 5xx während eines Deploys ist ein Retry, kein verlorener Visitor.
- App-Proxy-Signatur ist Pflicht; Cookie/Set-Cookie sind über den Proxy nicht verfügbar (ADR-0099 f).
