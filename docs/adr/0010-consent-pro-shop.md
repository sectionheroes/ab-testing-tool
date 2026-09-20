# ADR-0010: Consent: pro Shop über `Shop.requireConsent`, einzige Schnittstelle `Shopify.customerPrivacy`

Datum: 2026-09-20 · Status: entschieden

## Kontext
Ob ein Shop ohne Consent trackt, ist eine Entscheidung des Kunden (und seines Anwalts), nicht des Tools. Consent-Tools unterscheiden sich, Shopify bietet mit der Customer Privacy API eine gemeinsame Schnittstelle.

## Entscheidung
`Shop.requireConsent` (Default `false`). Bei `true` läuft das Snippet erst, wenn `Shopify.customerPrivacy.analyticsProcessingAllowed()` true ist – initial oder nach `visitorConsentCollected`. Vorher: kein Cookie, kein Bucketing, Control, kein Exposure, kein Attribut.

## Alternativen
- Immer tracken – rechtlich nicht haltbar für Kunden mit Consent-Pflicht.
- Nie ohne Consent tracken – schrumpft Samples um 20–40 % auch dort, wo der Kunde es nicht braucht.
- Direkte Integration je Consent-Tool – wartungsintensiv, Shopify-API deckt es ab.

## Konsequenzen
- Consent-Tool des Kunden muss die Customer Privacy API bedienen – pro Kunde beim Onboarding prüfen.
- Bekannter Bias bei `requireConsent`: Verweigerer fehlen komplett; Hinweis im Report.
