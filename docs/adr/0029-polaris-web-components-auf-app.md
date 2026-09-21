# ADR-0029: Polaris Web Components auf der embedded Merchant-Seite `/app/*`

Datum: 2026-09-21 · Status: entschieden · ersetzt ADR-0004 teilweise (nur der Punkt "Polaris entfernt")

## Kontext
ADR-0004 hat Polaris komplett entfernt, weil das Agentur-Dashboard sein eigenes Design (DESIGN.md) hat. Die embedded Merchant-Seite `/app` ist aber die einzige Seite, die Merchant und App-Reviewer im Shopify-Admin sehen. Review-Anforderung 2.2.2 verlangt eine "consistent embedded experience"; eine Tailwind-Seite im Admin-Iframe fällt optisch aus dem Rahmen. Joel will diese Seite (Status, Aktivierungscode, Theme-Embed-Link) in Polaris.

## Entscheidung
`/app/*` wird mit **Polaris Web Components** (`<s-page>`, `<s-section>`, `<s-text-field>`, `<s-button>`, `<s-badge>`, `<s-banner>`, `<s-link>` …) gebaut, die das App-Bridge-CDN-Script bereitstellt – kein npm-Paket `@shopify/polaris`, kein React-Polaris. Buttons ausschließlich `variant="secondary"` (weiß); `variant="primary"` (schwarz) ist auf `/app/*` verboten. Tailwind/daisyUI wird auf `/app/*` nicht geladen. `/dashboard/*` und `/login*` bleiben unverändert DESIGN.md-only ohne Polaris.

## Alternativen
- React-Polaris (`@shopify/polaris` npm) – legacy, schwer, bringt eigenes CSS ins Bundle; Shopify empfiehlt für neue Apps die Web Components.
- Tailwind auf `/app` behalten – funktioniert, wirkt im Admin aber fremd und ist ein vermeidbares Review-Risiko.
- Polaris auch fürs Dashboard – nein, DESIGN.md ist verbindlich (ADR-0004 bleibt dafür gültig).

## Konsequenzen
- Zwei UI-Welten im Repo, sauber nach Route getrennt: `app/routes/app.*` = Polaris, alles andere = DESIGN.md. Eine ESLint-Regel verbietet `app/components/*` in `app.*`-Routen und `<s-*>`-Elemente außerhalb davon.
- `grep -ri polaris build/` ist als Abnahmekriterium hinfällig; stattdessen: kein `@shopify/polaris` in `package.json`, keine `<s-*>`-Elemente unter `/dashboard`.
- Der Merchant-Seite-Look folgt Shopify-Updates automatisch (CDN), wir pflegen kein Polaris-CSS.
- Typen: `@shopify/app-bridge-types` (oder das vom Template gelieferte `polaris-types`) für JSX-Intrinsics wieder einbinden.
