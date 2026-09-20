# ADR-0001: App-Typ: Public App (unlisted) mit Shopify App Review, hybrid embedded + non-embedded

Datum: 2026-09-20 · Status: entschieden

## Kontext
Das Tool braucht Theme App Extension, App Proxy und später Shopify Functions. Public Apps sind bis zur Freigabe nur auf Development Stores installierbar; Kunden-Shops sind keine Dev Stores.

## Entscheidung
Eine Public App im Partner Dashboard, unlisted, die den App Review durchläuft. Hybrid: embedded Merchant-Seite `/app` (App Bridge, ID-Token) plus non-embedded Agentur-Dashboard `/dashboard`. Install ist offen; Nutzung erst nach Freischaltung (Allowlist oder Aktivierungscode auf `/app`).

## Alternativen
- Admin-Custom-App ("Develop apps") – kann weder Theme App Extension noch App Proxy.
- Custom-Distribution-App pro Kunde – kein Review, aber eine App pro Shop; nur Fallback (ADR-0003).
- Install-Gate vor OAuth – würde den Reviewer aussperren und verstößt gegen Req. 2.3.2.

## Konsequenzen
- Review und PCD müssen bis WP7 durch sein (WP-R); Install-Flow, `/app`, GDPR-Webhooks und Extension sind review-relevant.
- Ob das non-embedded Dashboard dem Review standhält, ist nicht abschließend belegt (ADR-0099 c/g) – der Reviewer sieht nur `/app`.
