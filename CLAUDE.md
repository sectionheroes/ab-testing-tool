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
Shopify Development Stores (sh-ab-testing-one/-two) for all development; local Homebrew Postgres `sh_ab_dev` for the
local DB. The Render database is production only – never point a local .env at it.
Never touch a merchant store from a dev session.

## Commands
pnpm dev            # shopify app dev --config dev (tunnels to the dev store) – hard-wired to sh-ab-dev
pnpm dev:dashboard  # second local server on http://localhost:3000 – the only origin Google OAuth accepts locally
pnpm test           # vitest, no database needed; includes the A/A Monte-Carlo (~15 s, FPR must stay 4–6 %)
pnpm test:db        # database-backed suite against the local Postgres; every case runs in a rolled-back transaction
pnpm build:snippet  # lib/snippet → extensions/sh-ab-embed/assets/shab.js, prints raw + gzip, fails above 8 KB gzip; then deploy --config dev
pnpm db:migrate     # prisma migrate dev against the local Postgres (.env = postgresql://<user>@localhost:5432/sh_ab_dev)
pnpm seed:admin <email>   # upsert a dashboard ADMIN (script, not a migration)
pnpm seed:load [exposures] [orders]   # synthetic load fixture on the LOCAL db (default 1M/30k); prints the aggregation and breakdown timings
pnpm measure:load [experimentId]      # re-measures an EXISTING fixture without seeding – for iterating on a query
pnpm seed:demo      # demo shops/experiments on the LOCAL db for working on the dashboard; only creates, never deletes
pnpm screenshots docs/screenshots/<wp>   # acceptance screenshots of every dashboard page, both themes, LOCAL only (needs pnpm dev:dashboard)
pnpm sync:config <shop>   # reserve `server` + rebuild/write the `client` metafield from RUNNING experiments
pnpm experiment:status <shop> <key> <RUNNING|PAUSED|ENDED> [decision]   # status change via the service layer (writes the metafield)
pnpm variant:code <shop> <key> <variant> --js <file> --css <file>       # code save via the service layer (hotfix on RUNNING)
pnpm config:validate      # shopify app config validate for dev and prod
pnpm deploy         # shopify app deploy --config prod – ask before running

Two app configs: shopify.app.dev.toml (sh-ab-dev) and shopify.app.prod.toml (sh-ab). `shopify app config use dev`
sets the default; never `shopify app config use prod` on a dev machine, always pass `--config` explicitly.

## Non-negotiable rules
- Contracts in docs/plan.md §4 (cart attribute format, metafield schemas, bucketing, exposure payload, editing rule)
  never change. If a task seems to require changing them, stop and ask. A *new* contract may be added next to an
  existing one as long as it leaves that one's format and semantics alone – that is how 4.1b, 4.9 and 4.10 came to be.
  Exactly two real amendments are sanctioned, both by ADR: 4.4 (ADR-0028) and the `n` field in 4.5 (ADR-0035).
- UI outside /app/*: follow docs/DESIGN.md strictly – its tokens, classes and recipes. No Polaris, shadcn, MUI, Radix, icon or chart
  libraries. All UI text in English (this overrides DESIGN.md §8, which says German). Numbers and currency formatted
  `de-DE` (1.234,56 €) unless docs/plan.md §8 says otherwise.
- Content on every dashboard page (Figma and code) follows docs/DESIGN.md §10: as little as possible, as much as
  needed, readable for a layperson; explanations in tooltips only where a layperson would stumble, never footnotes.
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
  The A/A Monte-Carlo test (FPR 4–6%) must stay green. Never widen the band to make it pass, and never lower the
  10,000-run count to fit a time budget. `STATS_VERSION` in lib/stats is bumped by hand whenever a formula changes.
- `.github/workflows/ci.yml` runs typecheck, lint, `pnpm test` and `pnpm test:db` on every pull request. All four green
  is the bar for a merge; the workflow uses `prisma migrate deploy`, never `migrate dev`.
- Raw SQL against a DateTime column binds its bounds through `utcTimestamp()` (app/services/stats.server.ts). A plain
  `${date}` parameter is sent as `timestamptz` and gets reinterpreted in the session timezone, which differs between a
  dev machine and Render – it looks right locally and is wrong in production.
- Measure before and after every query change, with `pnpm measure:load`, and read the EXPLAIN rather than guessing.
  Four traps, all of them measured, all of them cost an order of magnitude (WP4 and WP4.1):
  1. **No lateral join against a materialised CTE.** Query `"Exposure"` directly so its indexes are used.
  2. **A day is a UTC interval, never `to_char(...)` and never a `::date` group key on a big scan.** For a dimension
     the covering index serves, join against a small `VALUES` list of day intervals – a computed key cannot be read in
     index order, so Postgres sorts a million rows and spills to disk. For a dimension that has to visit the heap
     anyway (channel, which needs `referrer` and `utm`), the interval join is *wrong*: 30 range scans mean 30× random
     heap access. There the per-row date plus a hash aggregate wins, by 1.404 ms against 206 ms.
  3. **`VACUUM` twice after a bulk load, before measuring.** Index-only scans need the visibility map, and the first
     pass leaves pages that are not yet all-visible (measured: 27.162 heap fetches after one pass, 31 after two).
  4. **Do not pin the planner by accident.** A `LATERAL … LIMIT 1` against a UNIQUE index is a plain `LEFT JOIN` with
     extra steps, and the `LIMIT` forces a nested loop the planner would otherwise not choose.
- The dashboard never shows p-values or a winner before the stopping rule of ADR-0036 is met: at least
  `minConversionsPerArm` converting visitors per arm (default 1,000), at least `minDurationDays` days (default 14),
  and only on a full-week boundary counted from `startedAt` in the shop timezone – never from Monday. Counts and
  revenue are live (query, not DailyStat); only the verdict waits. `significant = stoppingRuleMet && p < alpha` is not
  negotiable, and the rule may only be tightened while RUNNING (contract 4.6) – loosening it would unlock a p-value.
  The tool never stops a test by itself; a failing futility projection is a warning, nothing more.
- One conversion is one visitor: the snippet carries the visitorId in its own cart attribute `_ab_v` (contract 4.1b)
  and the aggregation joins orders to exposures through it (ADR-0033, supersedes ADR-0032). `_ab_v` never carries the
  variant – that stays in `_ab` (4.1), which is unchanged. Orders without `_ab_v` fall back to the ADR-0032 identity
  (`Order.customerId`, else the order itself) and land in the `unknown` device bucket. `unknown` is a visible fourth
  bucket: the device rows always sum to the totals.
- Report time series follow contract 4.9: four charts per goal, a conversion counts on the day its visitor was first
  exposed (shop timezone), cumulative ratios are computed from cumulative numerators and denominators, and there is no
  certainty-over-time chart. Charts come from the live query with a day dimension, never from DailyStat.
- A date range or segment filter on Results is explore-only (ADR-0034): it changes charts and raw numbers, and while
  it is active the p-value, CI, significance, winner, sample-size progress and SRM badge are hidden, not recomputed.
  The Overview tab has no filters at all, because the verdict lives there.
- The segment dimensions of contract 4.10 (device, visitor type, channel) never show a p-value, CI or winner, and the
  improvement badge appears only from 100 visitors and 25 conversions per arm. No cross-filters between dimensions.
  Channel is derived from `Exposure.referrer`/`utm` at exposure time – last touch, and it will not match Shopify
  Analytics; the UI has to say so under the table.
- Every explained term in the UI gets its text from the glossary module, never inline in JSX – one definition per
  term, so the same term cannot drift between pages. Which terms get a tooltip at all is governed by DESIGN.md §10:
  only where a layperson stumbles, once per term at its first occurrence, never on self-explanatory column headers.
- Results never polls. It loads on open, reloads on tab focus and has a refresh button with "Updated n s ago"
  (DESIGN.md §10, ADR-0037). A value that is still locked gets no column of its own, and a lift stays neutral grey
  until the stopping rule is met – colour is a verdict.
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
- Every structural or functional decision made in a design session (Figma) goes into docs/STATUS.md the same session,
  under "Design-Entscheidungen": what changed in the layout, what changed in behaviour, and which part of plan.md or
  which ADR it deviates from. The developer and the sparring partner read STATUS.md, not Figma – a decision that only
  lives in Figma makes design and plan drift apart. If it changes plan content, also flag it as open for plan.md/ADR.

## Do not
- Write metafields or install the app on any store other than the dev store without explicit approval.
- Run `shopify app deploy` or a production deploy without explicit approval.
- Add a visual/WYSIWYG editor.
- Add dependencies to lib/snippet (hand-rolled only, size budget).
- Run `shopify app dev` against the production app config.
- Run `prisma migrate reset`, `prisma db push --force-reset`, `DROP`/`TRUNCATE`, or any command that deletes rows or tables
  against any database. A missing `_prisma_migrations` table does not mean the database is empty – inspect row counts first
  and report what you find before touching anything.
