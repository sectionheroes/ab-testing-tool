# ADR-0008: Auth-Provider: Google OAuth direkt (arctic, PKCE), kein Firebase

Datum: 2026-09-20 · Status: entschieden

## Kontext
Das Dashboard braucht "Mit Google anmelden" für Agentur-Accounts. Firebase Auth hätte ein Firebase-Projekt, Client-SDK, Admin-SDK und Service-Account-Key gebracht – für einen Login.

## Entscheidung
Google OAuth direkt (Authorization Code + PKCE mit `arctic`), signierter Session-Cookie server-side (httpOnly, 30 Tage). Zugang nur für eingeladene E-Mails oder `@sectionheroes.de`. 2FA empfohlen, nicht erzwungen.

## Alternativen
- Firebase Auth – vier bewegliche Teile statt Client-ID + Secret.
- Shopify-Login für das Dashboard – Agentur-Nutzer sind keine Merchants.

## Konsequenzen
- Eine Google-Cloud-OAuth-Client-ID als einzige externe Abhängigkeit.
- Session-Handling (Signatur, Rotation, Ablauf) liegt bei uns.
