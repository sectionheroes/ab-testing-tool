# sh-ab – Sectionheroes A/B testing for Shopify

Internal A/B testing tool for our agency's Shopify clients. Variants are code (JS/CSS) edited in the dashboard
or pushed via CLI; orders are attributed server-side through Shopify webhooks using the `_ab` cart attribute.
No visual/WYSIWYG editor, by design.
Read docs/konzept.md for the why, docs/rahmen.md for the boundaries, docs/plan.md for the how, docs/STATUS.md for where
we are, docs/DESIGN.md for every pixel of UI. Start every session with rahmen.md and STATUS.md.
Contracts in docs/plan.md section 4 are frozen.

## Stack
React Router v7 (Shopify CLI template). Two UI worlds split by route: the embedded merchant page /app/* uses Polaris Web Components (`<s-*>` from the App Bridge CDN script, no npm Polaris, buttons only `variant="secondary"` – never primary); the non-embedded agency dashboard under /dashboard uses Tailwind v4 + daisyUI 5
per DESIGN.md · Prisma + Render Postgres · Google OAuth (arctic, no Firebase) for the dashboard · single package, no workspaces · Vitest ·
esbuild for the snippet · CodeMirror 6 for the JS/CSS fields (the only UI dependency beyond DESIGN.md's stack).
Hosting: Render Web Service (Frankfurt, auto-deploy from GitHub, defined in render.yaml); cron via Render Cron Jobs hitting secret-protected /jobs/* endpoints.
Shopify Development Store for all development.
Never touch a merchant store from a dev session.

## Commands
pnpm dev            # shopify app dev --config dev (tunnels to the dev store) – hard-wired to sh-ab-dev
pnpm dev:dashboard  # second local server on http://localhost:3000 – the only origin Google OAuth accepts locally
pnpm test           # vitest, all packages
pnpm build:snippet  # lib/snippet → extensions/sh-ab-embed/assets/shab.js (WP3)
pnpm db:migrate     # prisma migrate dev (local .env = Render external URL)
pnpm seed:admin <email>   # upsert a dashboard ADMIN (script, not a migration)
pnpm config:validate      # shopify app config validate for dev and prod
pnpm deploy         # shopify app deploy --config prod – ask before running

Two app configs: shopify.app.dev.toml (sh-ab-dev) and shopify.app.prod.toml (sh-ab). `shopify app config use dev`
sets the default; never `shopify app config use prod` on a dev machine, always pass `--config` explicitly.

## Non-negotiable rules
- Contracts in docs/plan.md §4 (cart attribute format, metafield schemas, bucketing, exposure payload, editing rule)
  never change. If a task seems to require changing them, stop and ask.
- UI outside /app/*: follow docs/DESIGN.md strictly – its tokens, classes and recipes. No Polaris, shadcn, MUI, Radix, icon or chart
  libraries. All UI text in English (this overrides DESIGN.md §8, which says German). Numbers and currency formatted
  `de-DE` (1.234,56 €) unless docs/plan.md §8 says otherwise.
- UI on /app/* (embedded merchant page): Polaris Web Components only (`<s-page>`, `<s-section>`, `<s-button>` …),
  no Tailwind/daisyUI, no DESIGN.md components, and never `<s-button variant="primary">` – secondary (white) only.
- Money always comes from `*_price_set.shop_money.amount`. Never `total_price`, never presentment currency.
- Webhook handlers are idempotent on X-Shopify-Webhook-Id: persist the (PII-stripped) event, return 200, process
  inline; on failure record the error on WebhookEvent – /jobs/retry-webhooks picks it up. There is no queue. Keep
  handlers under 2 s.
- Never persist customer PII. Every stored webhook payload goes through stripPii(). We keep customer ids, never
  names, emails or addresses.
- The counting definitions in docs/plan.md 4.8 are law: which orders count, what a conversion is, where the
  attribution window ends, verdict on the primary metric only.
- visitorId is always the cookie. customer.id is metadata for linking, never a bucketing input.
- Every function in lib/stats has a reference test against a published worked example before it is used.
  The A/A Monte-Carlo test (FPR 4–6%) must stay green. Never widen the band to make it pass.
- The dashboard never shows p-values or a winner before plannedSampleSize is reached. Counts and revenue are live
  (query, not DailyStat); only the verdict waits.
- Editing a RUNNING experiment follows contract 4.6: code fields allowed with warning + AuditLog + report marker;
  targeting, allocation, weights and salt are locked.
- Snippet budget: 8 KB gzip. Snippet errors must never break the merchant's page – every variant runs in try/catch,
  and on any failure the original is shown.
- Exposure is sent once per visitor per experiment and only after the variant was actually applied (or visible,
  if the trigger says so). Sent with fetch keepalive; the local marker is set only on a 2xx.
- Use the Shopify Dev MCP (search_docs_chunks, validate_graphql_codeblocks) to verify API shapes, scopes, Liquid
  objects and limits. Do not rely on memory for Shopify specifics.
- Dashboard and CLI share one service layer. No business logic in route files or in the CLI.
- The app goes through Shopify app review. Install flow, the embedded /app page, GDPR webhooks and the theme app
  extension are review-relevant: check the current requirements with the Dev MCP before changing any of them.

## Conventions
- One branch per work package (wp1-skeleton, wp2-ingestion, …), PR with the acceptance checklist from docs/plan.md
  filled in as pass/fail with evidence.
- Server-only modules end in `.server.ts`.
- ADRs in docs/adr/, one file per decision, format in docs/adr/0000-template.md (Kontext, Entscheidung, Alternativen,
  Konsequenzen, Datum). Never edit an ADR; supersede it. plan.md §1 is the current state, ADRs are the history.
- End every session by overwriting docs/STATUS.md (never append). Half a page max.

## Do not
- Write metafields or install the app on any store other than the dev store without explicit approval.
- Run `shopify app deploy` or a production deploy without explicit approval.
- Add a visual/WYSIWYG editor.
- Add dependencies to lib/snippet (hand-rolled only, size budget).
- Run `shopify app dev` against the production app config.
