# ADR-0003: Fallback: Custom-Distribution-App pro Kunde

Datum: 2026-09-20 · Status: entschieden

## Kontext
Review oder PCD-Approval könnten bis WP7 nicht vorliegen. Der A/A-Test darf daran nicht scheitern.

## Entscheidung
Wenn Review oder PCD bis WP7 nicht durch sind: Custom-Distribution-App pro Kunde (Partner Dashboard, ein Store pro App, kein Review) mit derselben Codebase; die App unterstützt mehrere Credentials für Webhook-HMAC und Proxy-Signatur.

## Alternativen
- Admin-Custom-App – kein App Proxy, keine Theme App Extension.
- Warten bis Review durch ist – unbestimmte Verzögerung des A/A-Tests.

## Konsequenzen
- Multi-Credential-Fähigkeit muss von Anfang an im Code angelegt sein (Shop → App-Credentials).
- Nicht als Hauptweg: pro Kunde eine App anlegen, Extension deployen, Install-Link – bei acht Kunden acht Apps.
