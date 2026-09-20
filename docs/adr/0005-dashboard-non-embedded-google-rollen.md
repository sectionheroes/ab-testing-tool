# ADR-0005: Dashboard: non-embedded unter /dashboard, Google-Login, Rollen ADMIN/MEMBER/CLIENT

Datum: 2026-09-20 · Status: entschieden

## Kontext
Die Agentur braucht eine Übersicht über mehrere Shops; embedded Apps laufen immer im Kontext eines einzelnen Shops. Die UI hat ein eigenes Design und ist auf Englisch.

## Entscheidung
Non-embedded Dashboard in derselben App unter `/dashboard`, eigener Tab, Login mit Google, E-Mail-Allowlist per Einladung. Rollen `ADMIN`, `MEMBER` (intern) und `CLIENT` (read-only auf eigene Shops; Modell und Guards in Phase 1, UI in Phase 2). UI-Sprache Englisch.

## Alternativen
- Alles embedded – Multi-Shop-Übersicht unmöglich, Shopify-Admin-Optik erzwungen.
- Separate Dashboard-App auf eigener Domain – zweiter Deploy, doppelte Service-Schicht.

## Konsequenzen
- Ein Deploy für Backend, Merchant-Seite und Dashboard.
- Review-Risiko "off-platform feature" (ADR-0099 g) – `/dashboard` wird aus `/app` nie verlinkt.
