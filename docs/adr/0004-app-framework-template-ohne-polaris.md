# ADR-0004: App-Framework: Shopify CLI Template (React Router v7) ohne Polaris, Tailwind v4 + daisyUI 5

Datum: 2026-09-20 · Status: entschieden · Punkt "Polaris entfernt" ersetzt durch ADR-0029 (Polaris Web Components auf `/app/*`; Dashboard weiterhin ohne Polaris)

## Kontext
OAuth, Session-Storage, Webhook-Registrierung und Extension-Deploy sollen nicht selbst gebaut werden. Das Dashboard hat ein eigenes Design (DESIGN.md), das nicht nach Polaris aussieht.

## Entscheidung
Shopify CLI React-Router-Template im Framework-Mode als Basis; Polaris entfernt, Tailwind v4 + daisyUI 5 nach DESIGN.md. App Bridge (CDN-Script) nur auf `/app/*`. Ein Package, kein Monorepo.

## Alternativen
- Polaris behalten – Dashboard würde wie der Shopify-Admin aussehen; DESIGN.md ist verbindlich.
- Eigenes Framework ohne Template – OAuth, Session-Storage und Deploy-Pipeline selbst bauen.
- Monorepo mit Workspaces – nur Komplexität für ein einziges Package.

## Konsequenzen
- Template-Updates müssen um die Polaris-Entfernung herum gemerged werden.
- `lib/*` bleibt ohne Import nach `app/` (ESLint-Regel), damit Stats, Snippet und CLI eigenständig testbar sind.
