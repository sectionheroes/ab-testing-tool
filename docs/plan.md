# Implementierungsplan – A/B-Testing-Tool, Phase 1 (v3.9)

*Stand: 18.09.2026, v2 nach Joels Feedback. Baut auf dem Konzept-Doc auf (gleicher Ordner). UI-Design nach `DESIGN.md` (gleicher Ordner – ins Repo kopieren). Ziel: Das MVP so in Arbeitspakete schneiden, dass Claude Code jedes Paket in ein bis drei Sessions umsetzen kann, mit klaren Abnahmekriterien, und dass die Basis für Preis-/Versandtests (Phase 3) schon drin ist.*

**v3.9 (21.09., WP1-Fix):** Polaris zurück – aber nur auf der embedded Merchant-Seite `/app/*`, als Polaris Web Components (`<s-*>` aus dem App-Bridge-Script, kein npm-Polaris), Buttons ausschließlich `variant="secondary"` (weiß, nie primary/schwarz). Dashboard und Login bleiben DESIGN.md-only. ADR-0029, ersetzt ADR-0004 in diesem Punkt.

**v3.8 (21.09., WP1):** 8.5 entschieden (Joel): Visitor-ID Option D – JS-Cookie `_shab_vid` mit localStorage-Spiegel, bei jedem Page Load neu geschrieben (365 Tage), `_shopify_y` komplett raus (ADR-0028 ersetzt ADR-0009). Vertrag 4.4 entsprechend geändert – die einzige sanktionierte Vertragsänderung, weil die Grundlage nicht mehr existiert. Akzeptierter Bias dokumentiert (Wiederkehrer nach > 7 Tagen Safari verdünnen den Lift Richtung null, nie ein falscher Winner). Neue Env-Var `TOKEN_ENCRYPTION_KEY` für die Token-Verschlüsselung.

**v3.7 (20.09., WP0):** Abgleich mit `rahmen.md`: Retention bestätigt (`WebhookEvent.payload` nur bei Fehler, Zeile 30 Tage, `Exposure` 12 Monate, `Order.raw` schlanke Whitelist) · `ExperimentResult`-Snapshot und `Experiment.taintedDays` in §3, Berechnung WP4, Persistenz/UI WP5 · `/jobs/cleanup` in WP6 · 8.3 (de-DE) und 8.4 (A) entschieden · Slack bleibt neben Dashboard-Badges · WP-R-Checkliste aus der Doku-Verifikation (ADR-0099) · ADR-0001–0027 angelegt. **Aus der Verifikation offen:** `_shopify_y` wird seit 01.01.2026 nicht mehr gesetzt und App-Proxy-Responses verlieren `Set-Cookie` – 8.5 muss neu entschieden werden (Joel), §1 und 4.4 sind bewusst unverändert.

**v3.6 (20.09.):** App geht durch den Shopify App Review (Public Apps sind sonst nur auf Dev Stores installierbar). Folgen: Install offen + Freischaltung (Allowlist oder Aktivierungscode) statt Install-Gate · hybrid: embedded Merchant-Seite `/app` (App Bridge) + non-embedded Agentur-Dashboard · neues WP-R Review-Submission nach WP3 · Listing-Assets in §7 · Fallback = Custom-Distribution-App pro Kunde.

**v3.5 (20.09.):** 8.5 entschieden (`_shopify_y` als Visitor-ID, Fallback eigener Cookie), 8.6 entschieden (Retention-Vorschlag übernommen). Offen nur noch 8.3 und 8.4.

**v3.4 (20.09.):** Review-Runde eingearbeitet: Google OAuth direkt statt Firebase (Firebase entfällt) · Install-Allowlist · Dev-/Prod-App getrennt · PII-Strip in allen gespeicherten Payloads · Visitor-ID immer Cookie, Login verknüpft statt umbucketet · Consent entschieden (8.2) · Zähl-Definitionen als Vertrag 4.8 · Exposure per `fetch keepalive` · Cart-Attribut an Cart-Token gekoppelt · Rolle `CLIENT` (Modell jetzt, UI Phase 2) · `decision`/`conclusion` am Experiment · Sentry + Fehler-Digest · Webhook-Retry statt "Job" · neu offen: 8.5 (ITP-Cookie), 8.6 (Retention).

**v3.3 (20.09.):** Hosting zurück auf Render Web Service – App, DB und Cron alle auf Render, Firebase nur noch für Auth. Ersetzt die Hosting-Entscheidung aus v3. Trade-offs in §8.1.

**v3.2 (20.09.):** Live-Zähler im Dashboard (Besucher, Orders, Revenue aus Live-Query, nicht aus DailyStat); Frühwarnung bei Conversion-Einbruch; p-Werte weiterhin erst nach Sample Size.

**v3.1 (19.09.):** §0 verweist auf `rahmen.md` und `STATUS.md`, §8.4 Connection Pooling (offen, vor WP1), ADR-Format in `docs/adr/README.md`, Repo-Struktur ergänzt.

**v3 (18.09.):** Hosting auf Firebase App Hosting statt Render Web Service (DB bleibt Render), Monorepo aufgelöst (ein Package, `lib/` statt `lib/`), Cloud Scheduler für Cron. Trade-offs in §8.1.

**Änderungen v1 → v2:** Render statt Supabase · Non-embedded Dashboard mit eigenem Design (DESIGN.md), UI auf Englisch · JS/CSS-Editor im Interface, CLI als Zusatz · App-Typ präzisiert (Partner-Dashboard-App auf Dev Store braucht keinen PCD-Approval – siehe §1) · Google-Login · AuditLog für Änderungen an laufenden Tests.

---

## 0. Wie dieser Plan gedacht ist

- **Die Doku hat vier Ebenen:** `konzept.md` (warum, ändert sich selten) · `rahmen.md` (Rahmenbedingungen) · `plan.md` (wie, dieses Doc – §1 ist der aktuelle Stand aller Entscheidungen) · `STATUS.md` (wo stehen wir, wird jede Session überschrieben). Die ADRs in `docs/adr/` sind die Historie der Entscheidungen; `DESIGN.md` ist die UI-Spec.
- **Ein Arbeitspaket (WP) = ein Branch = eine oder mehrere Claude-Code-Sessions.** Session-Start: `CLAUDE.md`, `docs/rahmen.md`, `docs/STATUS.md` lesen, dann das WP hier – im Plan Mode, mit dem Session-Prompt aus diesem Doc. Session-Ende: `docs/STATUS.md` überschreiben (nie anhängen), bei neuen oder revidierten Entscheidungen ein ADR anlegen.
- **Abnahme = Tests grün + manuelle Prüfung auf dem Dev Store.** Nichts wird gemerged, was die Abnahmekriterien nicht erfüllt.
- **Die Verträge in §4 werden in keiner Session neu diskutiert.** Wenn Claude Code eine Änderung daran vorschlägt, ist das ein Stopp-Signal – erst mit Joel klären.
- **Kunden-Shops werden in Dev-Sessions nie angefasst.** Alles läuft auf einem Shopify Development Store, bis WP7.
- Abschnitte auf Deutsch sind für euch. Abschnitte auf Englisch (CLAUDE.md, Session-Prompts, Schemas) sind copy-paste für Claude Code und die Devs.

---

## 1. Fixierte Entscheidungen

| Entscheidung | Wahl | Warum |
|---|---|---|
| App-Typ | **Public App im Partner Dashboard, unlisted, geht durch den Shopify App Review.** Hybrid: embedded Merchant-Seite `/app` im Shopify-Admin (App Bridge, Session Tokens) + non-embedded Agentur-Dashboard `/dashboard`. Entwicklung und WP1–6 komplett auf einem Development Store. **Install ist offen, Nutzung nicht:** Nach dem Install steht der Shop auf `PENDING`; `ACTIVE` wird er automatisch, wenn die Domain vorher allowlisted war, sonst per Aktivierungscode auf der Merchant-Seite (für den Reviewer und als Notfallweg). | Public Apps sind bis zur Freigabe nur auf Development Stores installierbar – der Review ist Pflicht, kein Produkt-Feature. Ein Install-Gate würde den Reviewer aussperren, deshalb Freischaltung nach dem Install. Nur dieser App-Typ kann Theme App Extension, App Proxy und später Shopify Functions. Dev Stores brauchen **keinen** PCD-Approval; Review + PCD werden zusammen eingereicht (WP-R) und müssen bis WP7 durch sein. Ob der Review "embedded" zwingend verlangt, prüft WP0 (g) – die Hybrid-Lösung ist so oder so die richtige, weil der Merchant eine Seite im Admin braucht und die Client-Ansicht (Phase 2) genau dort hingehört. |
| Dev-/Prod-Trennung | **Zwei Apps im Partner Dashboard** (`sh-ab-dev`, `sh-ab`), zwei Configs `shopify.app.dev.toml` / `shopify.app.prod.toml`. Eine Datenbank bis WP7; ab dem ersten Kunden-Shop läuft lokale Entwicklung nur noch gegen eine eigene Dev-DB (Docker-Postgres oder zweite Render-Instanz). | `shopify app dev` überschreibt App-URL, Redirect-URLs und damit Proxy und Webhooks der verlinkten App – mit einer App bricht Prod bei jeder Dev-Session. PCD-Antrag für die Prod-App. |
| Fallback | **Custom-Distribution-App pro Kunde** (Partner Dashboard, ein Store pro App, kein Review) mit derselben Codebase; die App muss dafür mehrere Credentials (API Key/Secret pro App) für Webhook-HMAC und Proxy-Signatur können. | Nur wenn Review oder PCD bis WP7 nicht durch sind. Theme App Extension und App Proxy funktionieren dort genauso – im Gegensatz zur Admin-Custom-App ("Develop apps"), die beides nicht kann. Kostet: pro Kunde eine App anlegen, Extension deployen, Install-Link. **Nicht als Hauptweg**, sonst pflegen wir acht Apps. |
| App-Framework | Shopify CLI Template (React Router v7, Framework-Mode). **Zwei UI-Welten, nach Route getrennt:** `/app/*` (embedded Merchant-Seite) = **Polaris Web Components** (`<s-*>`, geliefert vom App-Bridge-CDN-Script, kein npm-Polaris), Buttons nur `variant="secondary"` (weiß), nie `primary`; alles andere (`/dashboard/*`, `/login*`) = Tailwind v4 + daisyUI 5 nach DESIGN.md, ohne Polaris. App Bridge nur auf `/app/*`. (ADR-0029) | OAuth, Session-Storage, Webhook-Registrierung, Extension-Deploy sind vorverdrahtet. DESIGN.md nutzt denselben Router – passt exakt. |
| Dashboard | Non-embedded, eigener Tab, Routen unter `/dashboard` in derselben App (die embedded Merchant-Seite `/app` ist davon getrennt und minimal). Login mit Google (OAuth direkt), E-Mail-Allowlist per Einladung. Rollen `ADMIN`, `MEMBER` (intern) und `CLIENT` (read-only auf die eigenen Shops – Datenmodell und Guards in Phase 1, die Client-Ansicht in Phase 2). **UI-Sprache Englisch.** | Multi-Client-Übersicht geht nur non-embedded (embedded = Kontext eines einzelnen Shops). Eigenes Design liegt vor. |
| Datenbank | Render Postgres via Prisma, Region Frankfurt | Joels Entscheidung. App und DB im selben Render-Workspace und derselben Region → interne Connection-URL (privates Netz, kein SSL nötig). Externe URL nur für lokale Entwicklung und Migrationen vom Laptop. |
| Hosting | **Render Web Service** (Node-Runtime, Auto-Deploy aus GitHub), Region Frankfurt, Plan **Starter** ab WP1 | Joels Entscheidung: alles auf Render, eine Plattform. Der Free-Plan schläft nach 15 min Inaktivität ein (Cold Start 30 s+) – für Webhooks und Beacons unbrauchbar, deshalb Starter von Anfang an. Der erste Deploy ist Abnahmekriterium in WP1. Cron über Render Cron Jobs. Details §8.1. |
| Auth-Provider | **Google OAuth direkt** (Authorization Code + PKCE, `arctic`), signierter Session-Cookie server-side. Kein Firebase. 2FA empfohlen, nicht erzwungen. | Eine Client-ID + Secret statt Firebase-Projekt, Client-SDK, Admin-SDK und Service-Account-Key. Passt zu "Mit Google anmelden" aus DESIGN.md. |
| Visitor-ID | **Eigener JS-Cookie `_shab_vid` mit localStorage-Spiegel** (Option D, ADR-0028): Cookie → localStorage → UUID v4; beide bei jedem Page Load mit 365 Tagen neu geschrieben. Kein `_shopify_y`. Regel in 4.4. `customer.id` ist Metadatum und wird beim Login server-side mit der Zuteilung verknüpft (4.5), nie Bucketing-Input. | `_shopify_y` wird seit 01.01.2026 nicht mehr gesetzt, App-Proxy strippt `Set-Cookie` (ADR-0099 e/f). Keine Infrastruktur pro Kunde. ITP kappt nur Besucher, die > 7 Tage nicht da waren – akzeptierter Bias (8.5): verdünnt den Lift, erzeugt nie einen falschen Winner. Cross-Device für eingeloggte Kunden erst Phase 2. |
| Consent | Pro Shop `requireConsent`. Einzige Schnittstelle ist `Shopify.customerPrivacy`; das Consent-Tool des Kunden (Cookiebot, Consentmo, Pandectes …) muss diese API bedienen. Ohne Consent: Control, kein Cookie, kein Exposure, kein Attribut. | Joels Entscheidung (8.2). Ob ein Shop ohne Consent trackt, entscheidet der Kunde, nicht das Tool. |
| Zählung | Vertrag 4.8: Visitors = Exposures ohne Bots; Orders = alles, was durch den Shopify-Checkout ging (kein POS, kein Draft, kein `test`), nicht storniert; CR auf konvertierende Visitors; Urteil nur auf der Primärmetrik. | Sonst rechnet jede Session anders. |
| Snippet-Delivery | Theme App Extension, App Embed Block mit `target: head` | Liegt auf `cdn.shopify.com`, ein Klick im Theme Editor, überlebt Theme-Updates |
| Config-Delivery | Shop-Metafield `$app:sh_ab.client`, inline in Liquid | Null extra Request, Kill Switch = Metafield-Update |
| Exposure-Tracking | `fetch keepalive` an App Proxy `/apps/sh-ab/e`, Merker erst bei 2xx | First-party, Ad-Blocker-resistent, kein stummer Verlust bei 5xx |
| Order-Tracking | Webhooks `orders/create`, `orders/updated`, `refunds/create` | Server-side, Shop-Währung, Refunds |
| Attribution | Cart Attribute `_ab` primär, Line Item Property `_ab` als Fallback, Customer-Lookup als dritter Weg (4.1) | Fallback deckt Buy-Now / Shop Pay ab; Lookup deckt eingeloggte Kunden ohne Attribut ab |
| Varianten-Editing | **JS- und CSS-Felder im Dashboard (CodeMirror 6)**, komplettes Experiment-Formular im UI. CLI `sh-ab` als Zusatz für Git-Workflow. | Joels Entscheidung. Kein WYSIWYG/Visual Editor. |
| Stats (MVP) | Fixed-horizon: Two-proportion z-test (CR), winsorized Welch t-test (RPV), Chi-Square SRM | Einfach, prüfbar. Signifikanz erst nach geplanter Sample Size (Anti-Peeking). Sequential in Phase 2. |
| Live-Daten | Zähler (Visitors, Orders, Revenue, SRM) live per Query, Auto-Refresh 60 s. `DailyStat` nur für Historie und Charts. | Joels Anforderung. Live-Zahlen sind für QA und Notbremse; das Urteil (p-Wert, Winner) bleibt hinter der Sample Size. |
| Sprache | TypeScript überall (Backend, Stats, Snippet, CLI). DESIGN.md sagt "kein TS nötig" – für dieses Tool trotzdem TS, weil Stats und Snippet Typen brauchen. UI-Komponenten dürfen `.tsx` sein. | Ein Stack |
| Tests | Vitest | Standard |
| Zahlenformat | UI-Text Englisch, Zahlen, Beträge und Daten `de-DE` (`1.234,56 €`, `20.09.2026`) über `Intl` (8.3, ADR-0022) | Kunden und Beträge sind deutsch; nur `Intl`-Aufrufe betroffen, später umschaltbar. |
| Connection Pooling | Option A: kein Pooler, `connection_limit=10&pool_timeout=5` in der Prisma-URL, eine Render-Starter-Instanz (8.4, ADR-0023) | Eine Instanz → max. 10 Verbindungen. PgBouncer (B) erst bei > 1 Instanz, ist nur eine Env-Var. |
| Retention | `WebhookEvent.payload` nur bei Fehler; `WebhookEvent`-Zeilen nach 30 Tagen, `Exposure` nach 12 Monaten gelöscht (`/jobs/cleanup`, WP6); `Order.raw` schlanke Whitelist; Orders/Refunds/DailyStat/AuditLog/`ExperimentResult` dauerhaft (`rahmen.md` §3, ADR-0024) | Speicher ist der einzige wachsende Posten; Rohdaten mit Personenbezug brauchen eine Frist. |
| Ergebnis-Snapshot | `ExperimentResult` (§3): versioniertes JSON, einmal beim Übergang auf `ENDED` eingefroren, nie neu berechnet; Report für beendete Experimente liest nur den Snapshot (ADR-0025) | Ergebnisse müssen ≥ 2 Jahre abrufbar sein, Rohdaten nicht – und ein alter Report darf sich nach Änderungen an der Stats-Engine nicht ändern. |
| Tainted Days | `Experiment.taintedDays` manuell im Dashboard (WP5), aus dem Auswertungsfenster ausgeschlossen (WP4), im Report und Snapshot sichtbar; automatische Erkennung Phase 2 (ADR-0026) | Regel aus `rahmen.md` 7.2 ohne Detektor-Infrastruktur umsetzbar. |
| Alerts | Dashboard-Badges (SRM, keine Exposures 24 h, Reconciliation-Diff, Snippet-Fehler) **und** Slack-Webhook bei `MISMATCH` + täglicher Digest (WP6, ADR-0027) | Badges dort, wo man hinschaut; Slack, weil niemand täglich das Dashboard öffnet. |

---

## 2. Repo-Struktur

```
sh-ab/
├── CLAUDE.md                     # Vorlage in §6
├── docs/
│   ├── konzept.md                # Warum: Problem, Ziele, Nicht-Ziele, Risiken – ändert sich selten
│   ├── rahmen.md                 # Rahmenbedingungen
│   ├── plan.md                   # Wie: dieses Doc, §1 = aktueller Stand der Entscheidungen
│   ├── STATUS.md                 # Wo stehen wir – Claude Code überschreibt es am Session-Ende
│   ├── DESIGN.md                 # UI-Spec, verbindlich
│   └── adr/                      # Historie: eine Datei pro Entscheidung, Format in adr/README.md
├── shopify.app.toml              # Scopes, Webhooks, App Proxy, embedded=true (Merchant-Seite), Dashboard läuft außerhalb
├── render.yaml                   # Render Blueprint: Web Service, Cron Jobs, Env-Vars (Secret-Werte im Render-Dashboard)
├── app/                          # React Router App (Shopify Template); app.* = Polaris Web Components, Rest = DESIGN.md
│   ├── app.css                   # Theme-CSS aus DESIGN.md §2, 1:1
│   ├── components/               # UI-Bausteine nach DESIGN.md (Shell, Table, KPI, Form, Alert, Skeleton, CodeField)
│   ├── routes/
│   │   ├── auth.*                # Shopify OAuth (Template); nach Install → /app (embedded), Shop = PENDING oder ACTIVE
│   │   ├── app._index.tsx        # Embedded Merchant-Seite (App Bridge): Status, Aktivierungscode, App-Embed-Deep-Link; Phase 2: Client-Ansicht
│   │   ├── webhooks.*.tsx        # ein Handler pro Topic
│   │   ├── proxy.e.tsx           # App Proxy: Exposure-Ingestion
│   │   ├── proxy.err.tsx         # App Proxy: Snippet-Fehler
│   │   ├── proxy.link.tsx        # App Proxy: Login-Link Visitor ↔ Customer (4.5)
│   │   ├── api.*.tsx             # JSON-API (Bearer) für CLI + später MCP
│   │   ├── login.tsx             # Google OAuth (Start + Callback)
│   │   └── dashboard.*.tsx       # DAS PRODUKT: Shops, Experiments, Editor, Results, Reconciliation
│   ├── services/
│   │   ├── attribution.server.ts # note_attributes / line_items → Zuordnung
│   │   ├── metafields.server.ts  # Config-Writer
│   │   ├── reconciliation.server.ts
│   │   ├── stats.server.ts       # Aggregation-Queries, ruft lib/stats
│   │   └── auth.server.ts        # Google OAuth, Session-Cookie, Allowlist, Rollen + Shop-Scoping
│   └── db.server.ts              # Prisma Client
├── extensions/
│   └── sh-ab-embed/              # Theme App Extension
│       ├── blocks/embed.liquid   # App Embed Block, target: head
│       └── assets/shab.js        # gebautes Snippet (aus lib/snippet)
├── lib/
│   ├── snippet/                  # Client-Script, TypeScript, esbuild → extensions/.../shab.js
│   ├── stats/                    # Stats-Engine, pure functions, keine DB
│   └── cli/                      # sh-ab CLI (Zusatz)
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── test/
    └── fixtures/webhooks/        # echte Shopify-Payloads vom Dev Store
```

**Ein Package, kein Monorepo.** Render baut mit einem Build-Command und startet mit einem Start-Command; Workspaces wären möglich, bringen für ein Package aber nur Komplexität. `lib/*` sind eigenständig testbare Ordner ohne Abhängigkeit auf `app/`; eine ESLint-Regel verbietet Imports von `lib/` nach `app/`. **Die Web-App ist `app/` – Backend (Webhooks, Proxy, API) und Dashboard in einem Deploy.**

---

## 3. Datenmodell (Prisma)

Nur die Kernfelder. Claude Code ergänzt Indizes und `createdAt/updatedAt`.

```prisma
model Shop {
  id             String   @id @default(cuid())
  domain         String   @unique          // "kunde.myshopify.com"
  name           String                    // Anzeigename im Dashboard
  accessToken    String?                   // encrypted at rest (offline token); null solange ALLOWLISTED
  status         ShopStatus               // ALLOWLISTED | PENDING | ACTIVE | UNINSTALLED – ALLOWLISTED = vorab angelegt; PENDING = installiert, nicht freigeschaltet
  requireConsent Boolean  @default(false)  // Entscheidung 8.2, pro Shop
  timezone       String?                  // shop.iana_timezone – Tagesgrenzen für DailyStat und Reconciliation (4.8)
  installedAt    DateTime?
  experiments    Experiment[]
  users          UserShop[]
}

model Experiment {
  id                String   @id @default(cuid())
  shopId            String
  key               String                    // slug, z.B. "pdp-reviews-above-price"; unique per shop
  name              String
  hypothesis        String?
  type              ExperimentType            // CODE | REDIRECT | PRICE | SHIPPING  (nur CODE in Phase 1)
  status            ExperimentStatus          // DRAFT | RUNNING | PAUSED | ENDED
  allocation        Float    @default(1.0)    // Anteil des Traffics im Test
  salt              String                    // random, fix nach Erstellung
  targeting         Json                      // siehe Vertrag 4.2
  trigger           Json                      // { type: "immediate" } | { type: "visible", selector }
  hideUntilApplied  Boolean  @default(false)
  primaryMetric     Metric                    // CR | RPV | AOV
  plannedSampleSize Int?                      // pro Variante, aus Sample-Size-Rechner
  startedAt         DateTime?
  endedAt           DateTime?
  decision          Decision?                 // WINNER | NO_DIFFERENCE | INVALID | ABORTED – Pflicht beim Stop
  conclusion        String?                   // das Learning in zwei Sätzen; Phase-2-Learnings-DB liest genau das
  taintedDays       Json     @default("[]")   // ["2026-10-03", …] – manuell im Dashboard (WP5); stats.server schließt diese Tage aus dem Auswertungsfenster aus (WP4); Phase 2: automatisch (rahmen 7.2)
  variants          Variant[]
  auditLog          AuditLog[]
  result            ExperimentResult?
  @@unique([shopId, key])
}

model ExperimentResult {                    // eingefrorener Ergebnis-Snapshot – rahmen.md §3.2; einmal beim Übergang auf ENDED, danach nur gelesen, nie neu berechnet
  id            String   @id @default(cuid())
  experimentId  String   @unique
  shopId        String
  v             Int                       // Schema-Version des Snapshots, startet bei 1
  statsVersion  String                    // Version von lib/stats, mit der gerechnet wurde
  frozenAt      DateTime
  snapshot      Json                      // evaluate()-Output (WP4) + eingefrorener Kontext, ohne Personenbezug:
                                          //  numbers: je Variante n, conversions, orders, revenue, cr, rpv, aov, lift, ci, pValue – gesamt und je Device (mobile/desktop/tablet);
                                          //           srm { pValue, observed, expected }; window { from, to }; taintedDays; sampleSizeReached; botShare
                                          //  frozen:  hypothesis, primaryMetric, plannedSampleSize, variants[{ key, name, weight, isControl, js, css }],
                                          //           targeting, allocation, salt, trigger, hideUntilApplied, startedAt, endedAt,
                                          //           codeChanges[{ at, actor, variantKey }] (aus AuditLog CODE_CHANGED_WHILE_RUNNING)
                                          //  verdict: decision, conclusion
                                          //  Phase 2: screenshot je Variante (§9)
}

model Variant {
  id            String   @id @default(cuid())
  experimentId  String
  key           String                    // "a" | "b" | "c"; "a" ist immer Control
  name          String
  weight        Float                     // Summe pro Experiment = 1.0
  isControl     Boolean
  js            String?
  css           String?
  serverConfig  Json?                     // Phase 3: { discountPct, hiddenShippingRates, ... }
  @@unique([experimentId, key])
}

model AuditLog {                          // wer hat wann was geändert – wichtig bei Edits an RUNNING
  id            String   @id @default(cuid())
  shopId        String
  experimentId  String?
  actor         String                    // E-Mail
  action        AuditAction               // CREATED | UPDATED | STATUS_CHANGED | CODE_CHANGED_WHILE_RUNNING
  diff          Json?
  at            DateTime
}

model Exposure {                          // Retention: 12 Monate, dann löscht /jobs/cleanup (WP6) – der Snapshot (ExperimentResult) hat die Zahlen
  id            String   @id @default(cuid())
  shopId        String
  experimentId  String
  variantId     String
  visitorId     String
  customerId    String?                   // Shopify customer id – per Login-Link (4.5) gesetzt, nie Bucketing-Input
  firstSeenAt   DateTime
  device        String                    // mobile | desktop | tablet
  country       String?
  referrer      String?
  utm           Json?
  isBot         Boolean  @default(false)
  @@unique([experimentId, visitorId])     // ein Visitor zählt einmal
}

model Order {
  id              String   @id @default(cuid())
  shopId          String
  shopifyOrderId  String
  orderNumber     String
  createdAt       DateTime
  currency        String                  // Shop-Währung
  totalPrice      Decimal                 // total_price_set.shop_money
  subtotalPrice   Decimal
  totalShipping   Decimal
  totalTax        Decimal
  totalDiscounts  Decimal
  shippingTitle   String?                 // shipping_lines[0].title – für Versandtests
  financialStatus String
  cancelledAt     DateTime?
  customerId      String?
  sourceName      String                  // web | shop_app | pos | shopify_draft_order … – Zählregel 4.8
  isTest          Boolean  @default(false) // order.test – zählt nie
  raw             Json                    // schlanke Whitelist via slimOrder() (WP2), nie der volle Payload: note_attributes, line_items (id, variant_id, product_id, quantity, price, properties), shipping_lines, alle *_price_set.shop_money, financial_status, cancelled_at, customer.id – ~4 KB statt ~30 KB (rahmen 3.1)
  lineItems       OrderLineItem[]
  attributions    OrderAttribution[]
  refunds         Refund[]
  @@unique([shopId, shopifyOrderId])
}

model OrderLineItem {
  id               String  @id @default(cuid())
  orderId          String
  shopifyVariantId String
  shopifyProductId String
  quantity         Int
  price            Decimal
  unitCost         Decimal?                // Phase 3: aus inventory_item.cost für Profit
}

model OrderAttribution {
  orderId       String
  experimentId  String
  variantId     String
  source        AttributionSource         // CART_ATTRIBUTE | LINE_ITEM_PROPERTY | CUSTOMER_LOOKUP
  @@id([orderId, experimentId])
}

model Refund {
  id              String   @id @default(cuid())
  orderId         String
  shopifyRefundId String   @unique
  amount          Decimal                 // Shop-Währung
  createdAt       DateTime
}

model WebhookEvent {                      // Idempotenz + Debugging; Zeilen älter als 30 Tage löscht /jobs/cleanup (WP6) – Shopifys Retry-Fenster ist kürzer
  id          String   @id @default(cuid())
  shopId      String
  topic       String
  shopifyId   String                      // X-Shopify-Webhook-Id
  receivedAt  DateTime
  processedAt DateTime?
  error       String?
  attempts    Int      @default(0)         // Retry-Zähler für /jobs/retry-webhooks
  payload     Json?                       // nur bei Fehler befüllt (Retry braucht den Body), PII-gestrippt via stripPii(); erfolgreiche Events: null
  @@unique([shopifyId])
}

model DailyStat {                         // materialisiert per Cron, fürs Dashboard
  shopId       String
  experimentId String
  variantId    String
  date         DateTime
  visitors     Int
  orders       Int
  revenueGross Decimal
  revenueNet   Decimal                    // nach Refunds
  @@id([experimentId, variantId, date])
}

model ReconciliationRun {
  id                String   @id @default(cuid())
  shopId            String
  date              DateTime
  ourOrderCount     Int
  shopifyOrderCount Int
  ourRevenue        Decimal
  shopifyRevenue    Decimal
  status            ReconStatus             // OK | MISMATCH
  details           Json?
}

model User {                              // Dashboard-Nutzer; Zeile entsteht durch Einladung, Login füllt name
  id        String @id @default(cuid())
  email     String @unique
  name      String?
  role      UserRole                      // ADMIN | MEMBER | CLIENT – CLIENT sieht nur Results seiner Shops (UI: Phase 2)
  shops     UserShop[]                    // nur für CLIENT; ADMIN/MEMBER sehen alles
  tokens    ApiToken[]
}

model UserShop {
  userId    String
  shopId    String
  @@id([userId, shopId])
}

model ApiToken {                          // Bearer-Token für API und CLI
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique             // nur der Hash; Klartext einmalig beim Erstellen
  label      String
  expiresAt  DateTime                     // max. 90 Tage; verlängern = neuer Token
  lastUsedAt DateTime?
}
```

---

## 4. Verträge (werden nie geändert)

### 4.1 Cart Attribute & Line Item Property

```
Key:    _ab
Value:  <experiment_key>:<variant_key>[,<experiment_key>:<variant_key>...]
Beispiel: pdp-reviews-above-price:b,free-shipping-bar:a
```

- `experiment_key` und `variant_key` matchen `^[a-z0-9-]+$` – `:` und `,` sind Trenner. Dashboard und API validieren das ab.
- Sortiert nach `experiment_key`, damit der String deterministisch ist.
- Nur Experimente mit Status `RUNNING`, in die der Visitor tatsächlich gebucketed wurde.
- Wird bei jedem Page Load geprüft und per `POST /cart/update.js` gesetzt, wenn sich **Wert oder Cart-Token** seit dem letzten Set geändert haben (Merker `{ cartToken, value }` in `localStorage`; Cart-Token aus dem `cart`-Cookie). Nach einem Checkout leert Shopify den Cart – der neue Cart bekommt das Attribut so wieder, und die zweite Bestellung desselben Besuchers landet in derselben Variante, weil das Bucketing deterministisch ist.
- Zusätzlich als `<input type="hidden" name="properties[_ab]" value="...">` in jedes `form[action*="/cart/add"]` injiziert (MutationObserver für dynamisch geladene Forms).
- Server-side beim Webhook: erst `note_attributes[_ab]`, wenn leer dann `line_items[*].properties[_ab]` (erste nicht-leere), wenn auch das leer ist und die Order eine `customer.id` hat: Lookup in `Exposure` über `customerId` (Login-Link, 4.5) für alle zum Order-Zeitpunkt laufenden Experimente. Quelle wird in `OrderAttribution.source` gespeichert (`CART_ATTRIBUTE` | `LINE_ITEM_PROPERTY` | `CUSTOMER_LOOKUP`).
- Phase 3: Shopify Functions lesen exakt dieses Attribut. Deshalb ändert sich das Format nie.

### 4.2 Metafield `client` – Schema

Namespace app-owned: `$app:sh_ab`, Key `client`, Typ `json`. In der Theme App Extension lesbar als `app.metafields.sh_ab.client`.

> Fußnote (WP3 3a, ADR-0030): Geschrieben wird auf die **AppInstallation** (`ownerId = currentAppInstallation.id`) mit dem einfachen Namespace `sh_ab` – nur so liefert Liquid den Wert unter `app.metafields.sh_ab.client`; mit `$app:`-Präfix hieße der Pfad `app.metafields["$app:sh_ab"].client`. Der Liquid-Pfad und das Schema bleiben wie hier definiert.

```json
{
  "v": 1,
  "requireConsent": false,
  "experiments": [
    {
      "key": "pdp-reviews-above-price",
      "status": "running",
      "allocation": 1.0,
      "salt": "k3f9",
      "targeting": {
        "url":    { "match": "regex", "value": "^/products/" },
        "device": ["mobile", "desktop", "tablet"]
      },
      "trigger": { "type": "immediate" },
      "hideUntilApplied": false,
      "variants": [
        { "key": "a", "weight": 0.5, "js": null, "css": null },
        { "key": "b", "weight": 0.5, "js": "document.querySelector(...)", "css": ".x{...}" }
      ]
    }
  ]
}
```

Targeting-Felder, die das Snippet in Phase 1 auswertet: `url` (`exact` | `contains` | `regex`), `device`. Phase 2 ergänzt `utm`, `country`, `referrer`, `customerStatus` – das Schema ist additiv, das Snippet ignoriert unbekannte Felder.

Nur Experimente mit `status: "running"` werden ins Metafield geschrieben. Pausiert/beendet = raus aus dem Metafield = Kill Switch.

### 4.3 Metafield `server` – Schema (Phase 3, jetzt nur reserviert)

Key `server`, Typ `json`, klein, kein Code. Wird von Shopify Functions gelesen.

```json
{ "v": 1, "experiments": { "free-shipping-threshold": { "b": { "hideShippingRates": ["Standard 4,90 €"] } } } }
```

### 4.4 Bucketing-Algorithmus

```
input  = `${visitorId}:${experimentKey}:${salt}`
hash   = fnv1a32(input)            // 32-bit FNV-1a, unsigned
bucket = hash % 10000              // 0..9999

if bucket >= allocation * 10000  → nicht im Experiment (kein Exposure, kein Attribut)
else:
  point = bucket / (allocation * 10000)   // 0..1
  Varianten in Reihenfolge des Arrays; kumulierte weights; erste Variante mit cum >= point
```

- `visitorId`, in dieser Reihenfolge (v3.8, ADR-0028): (1) Cookie `_shab_vid`, falls vorhanden; (2) sonst `localStorage["_shab_vid"]`, falls vorhanden; (3) sonst UUID v4. Das Ergebnis wird bei **jedem Page Load** in beide geschrieben – Cookie mit 365 Tagen, `SameSite=Lax`, Path `/`. Effekt: Safaris 7-Tage-Kappung für script-writable Cookies und Storage läuft bei jedem Besuch neu an; nur wer länger als 7 Tage nicht im Shop war, bekommt eine neue ID. Der Bias daraus ist akzeptiert (8.5): Solche Wiederkehrer können in der anderen Variante landen und verdünnen den gemessenen Lift Richtung null – ein falscher Winner entsteht daraus nie, weil Orders über das Cart-Attribut (4.1) immer die beim Kauf gesehene Variante tragen. Gilt auch für eingeloggte Kunden: `customer.id` wird nur mitgeschickt (4.5) und server-side verknüpft, ist nie Bucketing-Input, sonst wechselt die Variante beim Login.
- Force-Modus: `?ab_force=<key>:<variant>` überschreibt das Bucketing für die Session (`sessionStorage`), sendet kein Exposure, setzt kein Attribut. Mehrere Tests kommagetrennt. `?ab_force=off` deaktiviert alles.

### 4.5 Exposure-Payload

`POST /apps/sh-ab/e` via `fetch` mit `keepalive: true`, Body JSON:

```json
{ "v": 1, "e": "pdp-reviews-above-price", "var": "b", "vid": "…", "cid": null,
  "url": "/products/x", "dev": "mobile", "ref": "https://instagram.com/…",
  "utm": { "source": "ig", "medium": "paid", "campaign": "…" }, "t": 1726650000 }
```

- Gesendet **einmal pro Experiment pro Visitor**, und nur nach erfolgreichem Anwenden der Variante bzw. bei `trigger.type = "visible"` erst, wenn `selector` im Viewport war (IntersectionObserver). Control (`a`) sendet unter denselben Bedingungen.
- Transport: `fetch(url, { method: "POST", keepalive: true })`, **nicht** `sendBeacon`. Der Merker in `localStorage` wird erst bei 2xx gesetzt; bei Fehler oder fehlender Antwort wird beim nächsten Page Load erneut gesendet (server-side idempotent). Sonst ist jeder 5xx während eines Deploys ein stumm und endgültig verlorener Visitor.
- Login-Link: Ist `customerId` gesetzt, sendet das Snippet einmal pro Session `POST /apps/sh-ab/link` mit `{ vid, cid }`; der Server setzt `Exposure.customerId` für alle Exposures dieses `vid`. Damit bleibt die Variante beim Login stabil, und Orders ohne Attribut können über den Kunden zugeordnet werden (4.1).
- Consent (8.2): Bei `requireConsent` läuft das Snippet erst, wenn `Shopify.customerPrivacy.analyticsProcessingAllowed()` true ist – initial oder nach dem Event `visitorConsentCollected`. Vorher: kein Cookie, kein Bucketing, Control, nichts gesendet.
- Server verifiziert die App-Proxy-Signatur, ergänzt `country` (falls verfügbar) und `isBot` aus User-Agent, schreibt mit `ON CONFLICT DO NOTHING`.
- Parallel: `Shopify.analytics.publish("shab_exposure", {...})` für Custom Pixels und `window.dataLayer.push({ event: "shab_exposure", ... })` falls GTM vorhanden.

### 4.6 Editing-Regel für laufende Experimente (UI und CLI identisch)

- `DRAFT` / `PAUSED`: frei editierbar.
- `RUNNING`: Code-Felder editierbar, aber: Warnung im UI ("This experiment is live. Saving changes the variant for all future visitors and taints the results."), Eintrag `CODE_CHANGED_WHILE_RUNNING` im AuditLog, Metafield sofort aktualisiert (Hotfix-Fähigkeit), und der Results-Report zeigt einen Marker "variant changed on <date>" ab diesem Zeitpunkt. Targeting, Allocation, Weights, Salt sind bei `RUNNING` **gesperrt** (würden das Bucketing verschieben).
- CLI: `sh-ab push` auf `RUNNING` nur mit `--force`, gleiche Konsequenzen.

### 4.7 CLI-Dateiformat (Zusatz-Workflow)

```
experiments/
└── pdp-reviews-above-price/
    ├── experiment.json      # key, name, hypothesis, shop, allocation, targeting, trigger, primaryMetric, plannedSampleSize
    ├── b.js
    └── b.css
```

`sh-ab push <key>` → `PUT /api/shops/:shop/experiments/:key` (upsert; `key` ist nur pro Shop unique). Die CLI spricht dieselbe API wie das Dashboard; das UI ist der Hauptweg.

### 4.8 Zähl-Definitionen

- **Visitor:** eine `Exposure`-Row mit `isBot = false`. Ein Visitor pro Experiment, egal wie viele Seitenaufrufe.
- **Order zählt**, wenn sie über `orders/create` kam **und** `source_name` weder `pos` noch `shopify_draft_order` ist **und** `test = false` **und** `cancelledAt` null ist. Alles, was ein Kunde durch den Shopify-Checkout schickt (Web, Shop App, Buy Now, Shop Pay), zählt – auch unbezahlte Vorkasse; wird sie storniert, fällt sie per `orders/updated` wieder raus.
- **Attribution-Fenster:** `Order.createdAt` liegt zwischen `Exposure.firstSeenAt` und `Experiment.endedAt` (bzw. jetzt). Orders mit Attribut, aber ohne passende Exposure (Variante nie angewendet) zählen nicht – sie erscheinen nur in der Reconciliation.
- **Conversion Rate** = konvertierende Visitors / Visitors. Ein Visitor mit drei Orders konvertiert einmal – der z-Test setzt Binomialdaten voraus. Orders werden daneben als eigene Zahl gezeigt.
- **Revenue pro Visitor** = Summe `totalPrice` der attribuierten Orders des Visitors minus deren Refunds, Shop-Währung, winsorized am 99. Perzentil über beide Arme gemeinsam.
- **AOV** = Revenue / Orders; Basis sind Orders, nicht Visitors. Als Primärmetrik nur mit Warnung im UI: konditional auf Kauf – ändert die Variante die CR, verschiebt sich die Population.
- **Tagesgrenzen** (DailyStat, Reconciliation) in `Shop.timezone`, nicht UTC – so rechnet auch Shopify Analytics.
- **Urteil** (p-Wert, `significant`, Winner) nur für die Primärmetrik. Sekundärmetriken zeigen Schätzer und CI, keinen p-Wert. Mehr als zwei Varianten: jede gegen Control, Bonferroni auf α.

---

## 5. Arbeitspakete

Aufwände sind Schätzungen für "ein Dev mit Claude Code". Die Reihenfolge ist verbindlich – jedes WP baut auf dem vorigen auf.

### WP0 – Vorbereitung (Joel, manuell, ~1 Tag + Wartezeit)

Siehe Checkliste in §7. Claude Code parallel: Repo initialisieren, `CLAUDE.md` anlegen, `docs/` mit konzept.md, rahmen.md, plan.md, STATUS.md, DESIGN.md und `adr/` befüllen, ein ADR pro Entscheidung aus §1 im Format von `docs/adr/0000-template.md` schreiben, `STATUS.md` erstmals überschreiben. Claude Code soll in dieser Session außerdem gegen die aktuelle Shopify-Doku (Shopify Dev MCP) verifizieren: (a) Dev Stores brauchen keinen PCD-Approval, (b) – beantwortet: Public Apps sind bis zur Freigabe nur auf Dev Stores installierbar, deshalb WP-R – (c) eine embedded App darf non-embedded Routen außerhalb des Admin-Iframes ausliefern (unser Dashboard), (d) Cart Attributes und `_`-prefixed Line Item Properties sind in der Order im Shopify-Admin sichtbar (Versprechen konzept §7), (e) ob `_shopify_y` ein per HTTP gesetzter, per JS lesbarer Cookie ist und wie er sich vor Consent verhält (§8.5), (f) ob App-Proxy-Responses `Set-Cookie` durchreichen (§8.5), (g) die aktuellen App-Review-Anforderungen: ist "embedded" Pflicht, was verlangt das Listing (Privacy-Policy-URL, Support-Kontakt, Screenshots, Test-Anleitung), was gilt für Theme App Extensions (Lighthouse-Grenze), gibt es Anforderungen, die unsere Architektur (non-embedded Dashboard außerhalb des Admins, Freischaltung per Code) verletzt. Ergebnis als ADR und als Checkliste in WP-R.

### WP1 – App-Skeleton, OAuth, Design-Shell, Deploy (2–3 Tage)

**Inhalt**
- `shopify app init` mit React Router Template, pnpm, ein Package (kein Workspace). **npm-Polaris entfernen**, App Bridge behalten – die Merchant-Seite `/app/*` nutzt die Polaris Web Components (`<s-page>`, `<s-section>`, `<s-text-field>`, `<s-button variant="secondary">`, `<s-badge>`, `<s-banner>`) aus dem App-Bridge-Script, **niemals `variant="primary"`**; Tailwind/daisyUI wird auf `/app/*` nicht geladen (ADR-0029). `embedded = true` bleibt; die embedded Route `/app` ist die Merchant-Seite (Session-Token-Auth aus dem Template), `/dashboard/*` läuft non-embedded im eigenen Tab und nutzt die Google-Session, nie den Shopify-Kontext.
- Zwei App-Configs: `shopify app config link` für `sh-ab-dev` (→ `shopify.app.dev.toml`, für `shopify app dev`) und `sh-ab` (→ `shopify.app.prod.toml`, für `deploy`). `shopify app dev` läuft nie gegen die Prod-App.
- Tailwind v4 + daisyUI 5 einrichten, `app.css` 1:1 aus DESIGN.md §2, Inter laden. App-Shell (Sidebar, Header, Ladebalken) nach DESIGN.md bauen – mit Platzhalter-Seiten.
- Prisma auf Render Postgres (in Prod die interne URL als Env-Var im Render-Dashboard, lokal die externe URL mit `sslmode=require` in `.env`)
- `shopify.app.toml`: Scopes (`read_orders`, weitere per Shopify Dev MCP prüfen), Webhook-Subscriptions (`orders/create`, `orders/updated`, `refunds/create`, `app/uninstalled`, `customers/data_request`, `customers/redact`, `shop/redact`), App Proxy (`/apps/sh-ab` → `/proxy`)
- Install-Flow: OAuth läuft für jeden Shop durch. Token (encrypted) und `timezone` speichern; war die Domain `ALLOWLISTED` → `ACTIVE`, sonst `PENDING`. Redirect auf `/app` (embedded). `PENDING` zeigt: "This app is operated by Sectionheroes for its clients" + Feld für den Aktivierungscode (`ACTIVATION_CODE` in ENV, rotierbar) → `ACTIVE`. `ACTIVE` zeigt: Status, Deep-Link zum App Embed (`/admin/themes/current/editor?context=apps&activateAppId=…`), Kontakt. Solange `PENDING`: kein Metafield, kein Snippet-Config, Webhooks werden gespeichert, aber nicht ausgewertet.
- Shops-Seite minimal: Shop-Domain als `ALLOWLISTED` anlegen, `PENDING`-Shops freischalten
- Login mit Google OAuth direkt (Authorization Code + PKCE, `arctic`), signierter Session-Cookie server-side (httpOnly, 30 Tage). Zugang nur, wenn die E-Mail als `User` existiert (Einladung) oder auf `@sectionheroes.de` endet (dann `MEMBER` anlegen). Rollen-Guard: `CLIENT` kommt ausschließlich an `/dashboard/shops/:id/*` seiner Shops – Guard in Phase 1, Client-UI in Phase 2.
- Sentry (free) für Server-Exceptions, DSN als Env-Var
- Alle Webhook-Routen als Stubs, die in `WebhookEvent` loggen – schon hier durch `stripPii()` (WP2 vervollständigt sie)
- `render.yaml` (Web Service: Node-Runtime, Build `pnpm install --frozen-lockfile && pnpm build`, Start `pnpm start`, Health-Check `/healthz`, Region Frankfurt, Plan Starter; Secrets als `sync: false` → Werte im Render-Dashboard), Service mit dem GitHub-Repo verbinden, Auto-Deploy auf `main`; Prod-URL ins Partner Dashboard. Dockerfile aus dem Template behalten (Fallback: Render Docker-Runtime)

**Abnahme**
- Dev Store steht als `ALLOWLISTED` im Dashboard → Install per Install-Link endet auf `/app` im Admin mit Status `ACTIVE`; ein zweiter Dev Store ohne Eintrag landet auf `PENDING`, wird per Aktivierungscode `ACTIVE`, mit falschem Code nicht
- `shopify app dev` läuft gegen `sh-ab-dev`; App-URL und Proxy der Prod-App im Partner Dashboard bleiben danach unverändert
- Login mit einer Allowlist-Mail funktioniert, mit einer fremden Gmail nicht
- Shell sieht aus wie DESIGN.md (Dark und Light); kein `@shopify/polaris` in `package.json`, keine `<s-*>`-Elemente unter `/dashboard` oder `/login`
- `/app` besteht nur aus Polaris Web Components, kein Tailwind-Klassenname, kein schwarzer Button (Screenshot PENDING + ACTIVE)
- Testbestellung im Dev Store → `orders/create` in `WebhookEvent` mit HMAC ok
- App deinstallieren → `Shop.status = UNINSTALLED`
- **Deploy auf Render läuft durch**: Auto-Deploy aus GitHub, Health-Check grün, Webhook-Roundtrip in Prod < 5 s. Wenn die Node-Runtime nicht sauber baut: Docker-Runtime mit dem Template-Dockerfile – nicht tagelang festbeißen

**Session-Prompt (EN)**
> Read CLAUDE.md, docs/plan.md (sections 1, 2, WP1) and docs/DESIGN.md. Scaffold the app from the Shopify CLI React Router template and strip Polaris; keep App Bridge and `embedded = true` for the single embedded merchant route /app, while everything under /dashboard runs non-embedded in its own tab on the Google session. Set up Tailwind v4 + daisyUI 5 with the theme CSS from DESIGN.md §2 verbatim and build the app shell (sidebar, header, progress bar) with placeholder pages. Link two app configs (dev and prod) and never run `shopify app dev` against prod. Switch Prisma to Render Postgres. Declare scopes, webhooks and app proxy in shopify.app.toml – verify names and syntax with the Shopify Dev MCP. Implement the install flow so that every shop can install: persist the Shop with an encrypted offline token and its timezone, set ACTIVE when the domain was pre-allowlisted, otherwise PENDING; the embedded /app page explains the app is for Sectionheroes clients, accepts the activation code from ENV, and once ACTIVE shows the app-embed deep link. Implement Google sign-in with plain OAuth (arctic, PKCE), a signed session cookie, an email allowlist and role guards (ADMIN/MEMBER/CLIENT). Stub every webhook route to log a PII-stripped payload into WebhookEvent. Wire Sentry. Add render.yaml (web service, Node runtime, region Frankfurt, health check at /healthz) and get a first deploy on Render working, including a production webhook round-trip; keep the template Dockerfile as fallback. Deliver a working `shopify app dev` against the dev store. UI text in English.

### WP2 – Datenmodell + Webhook-Ingestion (2–3 Tage)

**Inhalt**
- Vollständiges Prisma-Schema aus §3, Migrationen
- Idempotenz: `X-Shopify-Webhook-Id` unique, Doppel-Delivery wird still verworfen
- `stripPii(payload)`: entfernt `customer` (bis auf `id`), `billing_address`, `shipping_address`, `email`, `contact_email`, `phone`, `note`, `client_details`, `payment_details`, `browser_ip`. Wird **vor** jedem Speichern eines Payloads angewendet. Test läuft über alle Fixtures und schlägt an, sobald eine bekannte PII-Property durchrutscht.
- `slimOrder(payload)`: Whitelist für `Order.raw` (§3, `rahmen.md` 3.1) – `note_attributes`, `line_items` (id, variant_id, product_id, quantity, price, properties), `shipping_lines`, alle `*_price_set.shop_money`, `financial_status`, `cancelled_at`, `customer.id`. Läuft nach `stripPii()`. Test: Ergebnis enthält keine Property außerhalb der Whitelist.
- Verarbeitungsmuster (es gibt keine Queue): Handler schreibt `WebhookEvent` (ohne `payload`), antwortet 200, verarbeitet inline. Wirft die Verarbeitung, landet der Fehler in `WebhookEvent.error`, `attempts++` und der PII-gestrippte Body in `WebhookEvent.payload` (nur dann); `POST /jobs/retry-webhooks` (Render Cron Job, stündlich) verarbeitet Events mit `error` und `attempts < 5` erneut und leert `payload` bei Erfolg. Handler bleiben unter 2 s – für Order-Parsing trivial.
- `orders/create`: Order (`sourceName`, `isTest`), LineItems, Attribution (Vertrag 4.1 inkl. `CUSTOMER_LOOKUP`), Beträge aus `*_price_set.shop_money`
- `orders/updated`: `financialStatus`, `cancelledAt` **und** alle Beträge neu – Order-Edits ändern Totals
- `refunds/create`: Refund mit `shop_money`-Summe der `transactions`
- `customers/data_request`: alle `Exposure`- und `Order`-Rows mit dieser `customerId` als JSON-Export in `WebhookEvent.payload` ablegen und im Slack-Digest melden – der Store Owner bekommt die Daten manuell von uns (Frist 30 Tage, ADR-0099 h); `customers/redact`: `customerId` in Exposure/Order auf null – mehr gibt es dank `stripPii` nicht; `shop/redact`: nach §8.6. Alle drei antworten sofort 200.
- Fixtures: echte Payloads vom Dev Store (Normalbestellung, Buy-Now-Bestellung, Bestellung ohne Attribut, Refund, Multi-Currency-Bestellung mit Presentment ≠ Shop-Währung)

**Abnahme**
- Unit-Tests gegen alle Fixtures grün
- Keine PII-Property aus den Fixtures findet sich in `WebhookEvent.payload` oder `Order.raw`; `Order.raw` enthält nur Whitelist-Felder und ist < 5 KB für die Normalbestellung
- Erfolgreich verarbeiteter Webhook hat `WebhookEvent.payload = null`
- Handler mit provoziertem Fehler → `WebhookEvent.error` und `payload` gesetzt, Retry-Job verarbeitet nach Fix erfolgreich und leert `payload`
- Dev Store: Bestellung mit manuell gesetztem Cart Attribute (`/cart/update.js` in der Browser-Konsole) → korrekt in `OrderAttribution` mit `source = CART_ATTRIBUTE`
- Dev Store: Buy-Now mit Line Item Property → `source = LINE_ITEM_PROPERTY`
- Multi-Currency-Fixture: `totalPrice` ist der Shop-Währungs-Betrag, nicht Presentment
- Refund reduziert nichts in `Order`, sondern liegt als eigene Row vor (Netto wird bei Aggregation berechnet)

**Session-Prompt (EN)**
> Read CLAUDE.md, docs/plan.md sections 3, 4.1 and WP2. Implement the full Prisma schema and migrations, then the webhook handlers for orders/create, orders/updated, refunds/create and the three compliance topics. Attribution parsing must follow contract 4.1 exactly. Always read money from `*_price_set.shop_money.amount`, never from `total_price`. Capture real webhook payloads from the dev store into test/fixtures/webhooks and write Vitest tests against them, including one multi-currency order. Handlers must be idempotent on X-Shopify-Webhook-Id, persist the event first, process inline, and record failures for /jobs/retry-webhooks. Every stored payload goes through a tested stripPii() – we never persist names, emails or addresses. WebhookEvent.payload is only stored when processing fails (and cleared once the retry succeeds); Order.raw is the slim whitelist from section 3 built by slimOrder(), never the full payload. orders/updated refreshes all money fields.

### WP3 – Metafield-Config, Theme App Extension, Snippet (4–5 Tage – der größte Brocken)

**Inhalt**
- `metafields.server.ts`: baut `client`-JSON aus `RUNNING`-Experimenten (Vertrag 4.2), schreibt per `metafieldsSet` auf den Shop; wird bei jedem Statuswechsel und jedem Code-Save aufgerufen; prüft Größenlimit des Metafield-Typs (per Shopify Dev MCP nachschlagen) und bricht mit klarer Fehlermeldung ab, wenn > 80 %
- Theme App Extension `sh-ab-embed`: App Embed Block mit `target: head`. Liquid rendert `window.__shab = { config: {{ app.metafields.sh_ab.client.value | json }}, customerId: {{ customer.id | json }}, shop: {{ shop.permanent_domain | json }} }` und lädt `shab.js` synchron
- `lib/snippet` (TypeScript, esbuild, Ziel < 8 KB gzip):
  - Visitor-ID (Vertrag 4.4), Force-Modus, Bot-Heuristik (`navigator.webdriver`, UA-Regex, kein `localStorage` → abbrechen)
  - Targeting-Matcher für `url` und `device`
  - Bucketing exakt nach 4.4
  - `hideUntilApplied`: `<html style="opacity:0">` mit 300 ms Timeout-Fallback, nur wenn mindestens ein gebucketes Experiment das Flag hat
  - Varianten anwenden: CSS sofort als `<style>`; JS in `try/catch` bei `DOMContentLoaded` (oder sofort, wenn DOM schon da). JS-Fehler → Variante gilt als nicht angewendet, kein Exposure, Fehler an `/apps/sh-ab/err`
  - Exposure nach 4.5 (`fetch keepalive`, Merker erst bei 2xx) inkl. `visible`-Trigger; Login-Link `/apps/sh-ab/link`
  - Cart Attribute + Hidden Inputs nach 4.1, Merker an den Cart-Token gekoppelt
  - Consent-Hook (8.2): bei `requireConsent` läuft das Snippet erst, wenn `Shopify.customerPrivacy.analyticsProcessingAllowed()` true ist – initial oder nach `visitorConsentCollected`. Vorher kein Cookie, kein Bucketing, Control. Das Consent-Tool des Kunden muss die Customer Privacy API bedienen (Pandectes und Consentmo nativ, Cookiebot über seine Shopify-App – pro Kunde beim Onboarding prüfen)
- App-Proxy-Routen `/proxy/e`, `/proxy/link` und `/proxy/err`: Signatur verifizieren, `Exposure` upsert bzw. `customerId` verknüpfen, Bot-Flag server-side, `204`
- Unit-Tests: Bucketing-Determinismus, Verteilung (100 k zufällige IDs → jede Variante ±1 % vom Erwartungswert, Allocation 0.5 → 50 % ±1 % draußen), Targeting-Matcher, Attribut-String-Builder

**Abnahme**
- Dev Store: Experiment per API anlegen und auf `RUNNING` setzen → Metafield enthält es; auf `PAUSED` → Metafield ohne es (Kill Switch). **Propagationszeit messen**, nicht annehmen – Shopify cached Storefront-HTML: Zeit von `metafieldsSet` bis der Storefront das neue Config-JSON liefert, anonym und eingeloggt, in `STATUS.md` festhalten. Über 60 s ist ein Problem, das wir kennen müssen
- App Embed im Theme Editor aktivieren, Variante B mit sichtbarer CSS-Änderung: Reload zeigt konsistent A oder B, kein Flackern (DevTools Performance-Recording), Inkognito-Fenster bekommt frische Zuteilung
- `?ab_force=…:b` erzwingt B, `Exposure`-Tabelle bleibt leer
- Normaler Besuch: genau eine `Exposure`-Row pro Visitor/Experiment, auch nach 10 Reloads
- Add to Cart → Shopify Admin → Order → "Additional details" zeigt `_ab`; Buy Now → Line Item Property sichtbar in der Order
- Zweite Bestellung nach einem Checkout (Shopify hat den Cart geleert): Attribut ist wieder gesetzt, gleiche Variante
- Login mit einem Dev-Store-Kunden: Variante bleibt, `Exposure.customerId` gesetzt; eine Bestellung, deren Attribut manuell entfernt wurde, wird per `CUSTOMER_LOOKUP` zugeordnet
- `/proxy/e` kurz auf 500 gezwungen → Merker bleibt leer, der nächste Page Load sendet erneut, am Ende genau eine Row
- Consent-Tool auf dem Dev Store (Pandectes oder Consentmo, Free-Plan) mit `requireConsent = true`: ohne Consent kein Cookie, keine Exposure, Control; nach Accept läuft alles ohne Reload
- Lighthouse Mobile auf der PDP: Performance-Score maximal 2 Punkte unter dem Wert ohne Embed
- Bundle < 8 KB gzip

**Session-Prompts (EN)** – drei Sessions empfohlen:
> **3a** Read CLAUDE.md, docs/plan.md sections 4.2, 4.4 and WP3. Implement the metafield config writer (app-owned namespace `$app:sh_ab`, key `client`, type json) triggered on every experiment status change and code save, with a size guard. Verify the exact metafield size limit and the `metafieldsSet` mutation shape with the Shopify Dev MCP. Then create the theme app extension with an app embed block targeting `head` that inlines the config and loads the snippet synchronously.

> **3b** Read docs/plan.md sections 4.1, 4.4, 4.5 and WP3. Build lib/snippet in TypeScript with esbuild, output to extensions/sh-ab-embed/assets/shab.js. Implement visitor id, force mode, bot heuristic, targeting, bucketing exactly per 4.4 (FNV-1a 32-bit), variant application with hideUntilApplied, exposure via fetch keepalive per 4.5 (marker only on 2xx), the login link call, consent gating through Shopify.customerPrivacy, and cart attribute plus hidden input injection per 4.1 with the marker bound to the cart token. Write Vitest tests for bucketing determinism and distribution (100k ids), targeting, and the attribute string builder. Budget: 8 KB gzip.

> **3c** Read docs/plan.md section 4.5 and WP3. Implement the app proxy routes /proxy/e, /proxy/link and /proxy/err with Shopify proxy signature verification, server-side bot flagging, and idempotent Exposure upsert. Then run the full WP3 acceptance checklist against the dev store using the browser tools and report each item as pass/fail with evidence.

### WP-R – App Review einreichen (nach WP3, läuft parallel zu WP4–6)

Der Review ist der längste externe Pfad: Shopify nennt Tage, real sind es oft zwei Wochen pro Runde, und die erste Runde wird selten ohne Nachbesserung angenommen. Deshalb einreichen, sobald das Snippet steht – Results und Dashboard braucht der Reviewer nicht.

**Inhalt**
- Anforderungen aus WP0 (g) als Checkliste abarbeiten; Stand vor dem Einreichen per Shopify Dev MCP nochmal gegen die aktuellen Requirements prüfen
- Listing (unlisted): Name, Icon, Screenshots der Merchant-Seite, Kurzbeschreibung ("A/B testing operated by Sectionheroes for its clients – requires a Sectionheroes engagement"), Privacy-Policy-URL, Support-E-Mail, Pricing "Free"
- Test-Anleitung für den Reviewer: Install → Aktivierungscode (im Text) → App Embed aktivieren → Test-Experiment mit sichtbarer CSS-Änderung ist vorbereitet (wir legen es auf dem Reviewer-Shop an, sobald er `ACTIVE` ist – Slack-Alert bei neuem `PENDING`/`ACTIVE`)
- PCD-Antrag im selben Zug: Begründung "order attribution for A/B tests", keine Level-1-Felder, Datenminimierung per `stripPii()` beschreiben
- Nach jeder Ablehnung: Punkte in `STATUS.md`, fixen, neu einreichen – nichts anderes parallel anfangen, was den Review-Stand ändert (Install-Flow, Merchant-Seite, Extension)

**Abnahme**
- App-Status "Approved" im Partner Dashboard, PCD gewährt
- Install-Link funktioniert auf einem Nicht-Dev-Store (unser eigener Test-Shop, nicht der Kunde)

**Checkliste aus WP0 (g) – Stand der Shopify-Doku 20.09.2026, Quellen in ADR-0099**

*Vor dem Einreichen nochmal gegen `shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements` prüfen – die Liste ändert sich.*

- [ ] **Embedded:** App-Bridge-Script (`app-bridge.js` von der Shopify-CDN) als erstes Script im `<head>` jeder Seite unter `/app/*`; ID-Token-Auth (Session Tokens), keine Third-Party-Cookies, funktioniert in Chrome Inkognito (Req. 1.1.1, 2.2.3). Der Reviewer sieht nur `/app`.
- [ ] **Off-Platform:** Req. 2.2.2 verlangt, dass "off-platform features" im Admin integriert sind; "Pass app review" nennt "switches between embedded and not embedded versions" als Ablehnungsgrund. Unser Agentur-Dashboard `/dashboard` ist kein Merchant-Feature: nirgends aus `/app` verlinkt, im Listing nicht als Merchant-Funktion beschrieben, Login nur für Sectionheroes-Accounts. Die Merchant-Seite `/app` zeigt Status, App-Embed-Deep-Link und Kontakt – das ist die komplette Merchant-Funktionalität. Risiko bleibt "unclear" (ADR-0099 c/g); Fallback: Custom-Distribution-App (§1).
- [ ] **Install-Flow:** OAuth sofort nach Install, keine UI vor OAuth, Redirect nach OAuth direkt auf `/app` (Req. 2.3.2, 2.3.3); Reinstall läuft wieder durch OAuth (2.3.4); nie eine manuelle Eingabe der myshopify-Domain (2.3.1). Aktivierungscode erst **nach** OAuth auf `/app` – die Doku kennt für B2B-Apps ("require a more complex sign-up, which often involves a business-to-business contract") ausdrücklich die Ausnahme vom Self-Service-Onboarding (Built for Shopify 3.1.3); im Testhinweis für den Reviewer den Code mitliefern.
- [ ] **GraphQL only:** neue Public Apps seit 01.04.2025 ausschließlich GraphQL Admin API (Req. 2.2.4) – kein REST-Call im Code, auch nicht in der Reconciliation.
- [ ] **Theme App Extension:** Pflicht für Storefront-Integration; App Embed Block ist per Default deaktiviert, `/app` erklärt die Aktivierung und zeigt den Status per `app.extensions()` bzw. Deep-Link; kein App-Branding im Storefront (Standard-Attribution ≤ 24 px oder gar nichts), keine Review-Bitten.
- [ ] **Performance:** App darf den Lighthouse-Performance-Score um höchstens 10 Punkte senken; Shopify misst gewichtet Home 17 % / PDP 40 % / Collection 43 %, vorher/nachher. Unser WP3-Ziel (≤ 2 Punkte auf der PDP) liegt weit darunter – vor Einreichung alle drei Seitentypen messen, mehrere Läufe mitteln.
- [ ] **Compliance-Webhooks:** `customers/data_request`, `customers/redact`, `shop/redact` als `compliance_topics` in `shopify.app.toml`, HMAC-geprüft, antworten 200 (Pflicht für App-Store-Apps).
- [ ] **PCD:** Antrag (Level 1, Begründung, Data-Protection-Details) **vor** dem Einreichen stellen – "Applying for protected customer data isn't possible while the app is under review."
- [ ] **Konfiguration:** App-Icon 1200×1200 (JPEG/PNG); App-URLs und API-Contact-E-Mail ohne "Shopify" im Namen; Emergency Developer Contact (E-Mail + Telefon) im Partner-Account (Req. 4.5.6).
- [ ] **Listing (limited visibility = unlisted):** Primärsprache; App-Name; Introduction (100 Zeichen, Nutzen statt Marketing); 3–6 Screenshots 1600×900 der Merchant-Seite `/app`, ohne Browser-Chrome, ohne PII, mit Alt-Text; Feature-Media optional; Privacy-Policy-URL; Support-E-Mail; Pricing "Free".
- [ ] **Test-Anleitung (Req. 4.5.3–4.5.5):** Screencast (Englisch oder englische Untertitel) mit Install → Aktivierungscode → App Embed aktivieren → Test-Experiment sichtbar; Aktivierungscode und alle Zugangsdaten im Submission-Formular, aktuell gehalten; Demo-Store-URL (Dev Store).
- [ ] **Keine Fehler:** keine 404/500/30x auf irgendeiner Route, die der Reviewer erreichen kann (Req. 2.1.1–2.1.3); `/dashboard` ohne Login zeigt eine saubere Login-Seite, keinen Fehler.
- [ ] **Allgemein:** nur faktische Angaben im Listing (1.1.4); keine deprecated APIs (< 90 Tage); Install-Eligibility im Formular: Online Store erforderlich.

### WP4 – Stats-Engine + A/A-Simulation (2–3 Tage)

**Inhalt**
- `lib/stats`, pure functions, keine DB:
  - `twoProportionZTest(a, b)` → p-value, CI für Lift
  - `welchTTest(samplesA, samplesB, { winsorize: 0.99 })` für RPV
  - `srmCheck(observedCounts, expectedWeights)` → Chi-Square p-value; Alarm bei p < 0.001
  - `sampleSize({ metric: "CR", baselineCR, mde, alpha: 0.05, power: 0.8 })`; für RPV `sampleSize({ metric: "RPV", mean, sd, mde })` (kontinuierlich; σ aus den letzten 30 Tagen Orders des Shops, RPV-Varianz ≈ CR·E[AOV²] − (CR·AOV)²), für AOV dasselbe auf Order-Basis. Zweitrangig: CR zuerst, RPV/AOV dürfen in WP5 nachziehen – aber vor WP7, weil vier der geplanten Tests RPV haben
  - `evaluate(experiment, variantStats)` → pro Variante: `visitors, orders, cr, rpv, aov, lift, ci, pValue`, plus `srm`, plus `sampleSizeReached: boolean`. **`significant` ist nur `true`, wenn `sampleSizeReached && pValue < alpha`.** Regeln aus 4.8: CR auf konvertierende Visitors, Attribution-Fenster bis `endedAt`, Urteil nur Primärmetrik, Bonferroni bei mehr als zwei Varianten
  - Der `evaluate()`-Output ist zugleich der `numbers`-Teil des Snapshots `ExperimentResult.snapshot` (§3): deshalb zusätzlich dieselben Kennzahlen je Device (`byDevice: { mobile, desktop, tablet }`), `window { from, to }`, `taintedDays`, `botShare`, und `lib/stats` exportiert eine `STATS_VERSION`-Konstante (semver, bei jeder Änderung an einer Testfunktion erhöhen). Einfrieren und Persistenz sind WP5.
- `stats.server.ts`: **Live-Aggregation** aus `Exposure ⨝ OrderAttribution ⨝ Order ⨝ Refund` für laufende Experimente – eine Query, Indizes auf `(experimentId, variantId)`, `(orderId)`, `(experimentId, firstSeenAt)`; Zielzeit < 500 ms bei 1 Mio. Exposures. Revenue pro Visitor = Summe seiner attribuierten Orders minus Refunds; Order-Filter (`sourceName`, `isTest`, `cancelledAt`) und Attribution-Fenster exakt nach 4.8; `isBot`-Exposures ausgeschlossen. **Tainted Days:** Exposures, deren `firstSeenAt` (in `Shop.timezone`) auf einen Tag aus `Experiment.taintedDays` fällt, werden samt ihren Orders ausgeschlossen – der Visitor existiert für die Auswertung nicht.
- `guardrail(variantStats)` in `lib/stats`: ab 500 Visitors pro Arm, wenn CR einer Variante < 50 % der Control → `warning: "possible breakage"`. Kein Auto-Stop, nur Hinweis.
- Render Cron Job (täglich 03:00) → `POST /jobs/daily-stats` mit Secret-Header: `DailyStat` materialisieren – nur für Historie und Charts (Phase 2), nie Quelle der Results-Seite
- A/A-Monte-Carlo als Test: 10 000 simulierte Experimente (Bernoulli-Conversion mit CR 2–4 %, Lognormal-AOV, n = 5 000–50 000 pro Arm) → Anteil `pValue < 0.05` muss zwischen 4 % und 6 % liegen, für CR **und** RPV separat
- Referenz-Tests: bekannte Beispiele (z. B. Evan Millers Calculator, `scipy.stats`) müssen auf 4 Nachkommastellen reproduziert werden

**Abnahme**
- Test-Suite grün inkl. A/A-Simulation
- FPR-Report in `lib/stats/README.md` mit den gemessenen Werten
- `evaluate()` gibt für ein Experiment ohne erreichte Sample Size nie `significant: true`
- Test: ein Tag in `taintedDays` reduziert `visitors` und `orders` genau um die Exposures dieses Tages; `byDevice` summiert sich auf die Gesamtwerte

**Session-Prompt (EN)**
> Read CLAUDE.md and docs/plan.md 4.8 and WP4. Build lib/stats as pure TypeScript and apply the counting definitions in 4.8 exactly. Before writing any test statistic, write the reference tests first: reproduce at least three published worked examples (two-proportion z-test, Welch t-test, chi-square GOF) to 4 decimals. Then implement the functions, then the A/A Monte-Carlo test (10,000 runs, both CR and RPV) asserting a false-positive rate between 4% and 6%. If the FPR is outside that band, the implementation is wrong – fix it, do not widen the band. Document measured FPR in the package README. evaluate() must also return per-device numbers, the evaluation window, the tainted days it excluded and the bot share, because its output becomes the frozen ExperimentResult snapshot in WP5; export a STATS_VERSION constant. Exposures on tainted days (in the shop's timezone) are excluded together with their orders.

### WP5 – Dashboard mit Editor + API + CLI (4–5 Tage)

**Inhalt – Dashboard (Hauptweg), alles nach DESIGN.md, Englisch**
- **Shops**: Liste aller Shops (`ALLOWLISTED` / `PENDING` / `ACTIVE` / `UNINSTALLED`) mit laufenden Tests und letztem Reconciliation-Status; Domain allowlisten, `PENDING` freischalten (aus WP1 hierher verschoben und ordentlich gemacht)
- **Users** (nur ADMIN): einladen per E-Mail mit Rolle; `CLIENT` bekommt Shop-Zuordnung. Die Client-Ansicht selbst ist Phase 2 – in Phase 1 landet ein `CLIENT` nach Login auf einer "Nothing here yet"-Seite
- **Experiments** (pro Shop und global): Tabelle mit Status, Laufzeit, Sample-Size-Fortschritt, SRM-Badge; Filter/Sort/Pagination clientseitig wie in DESIGN.md
- **Experiment erstellen / bearbeiten** – ein Formular:
  - Basis: key (auto aus name, editierbar bis zum ersten Start), name, hypothesis, primaryMetric, plannedSampleSize (mit eingebautem Sample-Size-Rechner: baseline CR, MDE → Ergebnis)
  - Targeting: URL-Regel (exact/contains/regex), Device-Checkboxen; Trigger (immediate / visible + selector); hideUntilApplied
  - Allocation, Varianten mit Weights
  - **Pro Variante: JS-Feld und CSS-Feld als CodeMirror-6-Editor** (Syntax-Highlighting, Zeilennummern, Dark/Light nach Theme), Control hat keine Felder
  - Unsaved-Bar, Save/Discard, Inline-Validierung (Weights = 1.0, key unique, Regex kompiliert)
  - Editing-Regel nach 4.6 inkl. Warnung bei `RUNNING`
  - QA-Bereich: Force-Links pro Variante zum Kopieren (`https://shop.de/products/…?ab_force=key:b`)
- **Results**: Varianten-Tabelle aus `evaluate()` (visitors, orders, CR, RPV, AOV, lift, CI, p-value), SRM-Badge, Sample-Size-Fortschritt, Bot-Anteil, AuditLog-Marker, Guardrail-Warnung, Device-Split als aufklappbare Zeilen; **Zähler live** (Auto-Refresh 60 s, "updated n seconds ago"); **vor erreichter Sample Size steht "Not yet conclusive – n/N visitors" und keine p-values**; Start/Pause/Stop-Buttons mit Bestätigung; Stop verlangt `decision` und `conclusion` (§3)
- **Stop = Einfrieren**: Der Stop-Dialog ruft in einer Transaktion `evaluate()`, schreibt `ExperimentResult` (§3: `numbers` + `frozen` + `verdict`, `statsVersion`, `frozenAt`) und setzt erst dann `ENDED`. Für `ENDED`-Experimente liest die Results-Seite **ausschließlich** den Snapshot (Hinweis "Frozen on <date>, stats v<x>"), nie mehr die Live-Query. Kein "Recompute"-Button.
- **Tainted Days**: Feld am Experiment (Liste von Datumswerten, Datepicker, nur bei `RUNNING`/`PAUSED` editierbar, AuditLog `UPDATED`); Results zeigt "n days excluded: …" und die Sample-Size-Anzeige rechnet ohne diese Tage
- **Reconciliation**: Tabelle der täglichen Läufe pro Shop (Daten ab WP6)
- **Audit Log** pro Experiment

**Inhalt – API + CLI (Zusatz)**
- JSON-API mit Bearer-Token (pro User im Dashboard erzeugt, nur Hash gespeichert, max. 90 Tage): `GET/PUT /api/shops/:shop/experiments/:key`, `POST …/status`, `GET …/results`. Dieselbe API nutzt später der MCP Server.
- `lib/cli` (`sh-ab`): `init`, `push [--force]`, `start`, `pause`, `stop`, `status`, `results`; Konfig in `.sh-abrc`

**Abnahme**
- Kompletter Workflow nur im UI: Experiment anlegen → CSS in B eintippen → Save → Start → Dev Store zeigt Variante → nach Besuchen zeigt Results Visitors > 0 → Testbestellung → Orders und Revenue korrekt
- Edit an `RUNNING`: Warnung erscheint, AuditLog-Eintrag, Metafield sofort aktualisiert, Marker im Report
- Targeting-Felder bei `RUNNING` disabled
- Results ohne erreichte Sample Size zeigen keine p-values; Sekundärmetriken nie
- Stop ohne `decision` ist nicht möglich
- Stop erzeugt genau eine `ExperimentResult`-Row; danach eine Testbestellung mit Attribut → Results unverändert (Snapshot), Live-Query wird nicht mehr aufgerufen
- Tag als tainted markieren → Visitors/Orders in Results sinken um die Exposures dieses Tages, Hinweis sichtbar
- Testbestellung im Dev Store erscheint innerhalb von 60 s in Results, ohne Cron
- Derselbe Workflow per CLI funktioniert ebenfalls
- Dark- und Light-Theme, Mobile-Breite ohne horizontales Scrollen, keine Verstöße gegen DESIGN.md §9

**Session-Prompts (EN)** – zwei Sessions empfohlen:
> **5a** Read CLAUDE.md, docs/plan.md (4.6, WP5) and docs/DESIGN.md in full. Build the dashboard pages Shops, Experiments list, Experiment create/edit and Results using only the components and recipes from DESIGN.md (no other UI libraries; CodeMirror 6 is the single allowed exception, for the JS and CSS fields). Implement the editing rule from contract 4.6 including the running-experiment warning, AuditLog entries and the report marker. Include the sample-size calculator in the form. The Results page must never show p-values or a winner before plannedSampleSize is reached. Stopping an experiment must freeze an ExperimentResult snapshot (section 3) in the same transaction that sets ENDED; ended experiments render from the snapshot only. Add the tainted-days editor (list of dates) and show excluded days in Results. All UI text in English.

> **5b** Read docs/plan.md 4.7 and WP5. Implement the bearer-token JSON API (tokens generated per user in the dashboard, stored as hashes, expiring after 90 days, shop-scoped routes) and the sh-ab CLI in lib/cli. The CLI must use exactly the same service layer as the dashboard – no duplicated business logic. `push` on a RUNNING experiment requires `--force` and produces the same AuditLog entry as a UI edit.

### WP6 – Reconciliation, Alerts, Bot-Filter (1–2 Tage)

**Inhalt**
- Render Cron Job (täglich 04:00) → `POST /jobs/reconcile` mit Secret-Header: pro Shop Orders des Vortags via Admin GraphQL (`orders(query: "created_at:>=… created_at:<…")`, `customAttributes`), Filter auf `_ab` → Count + Summe vs. `Order ⨝ OrderAttribution` in unserer DB → `ReconciliationRun`
- `MISMATCH` = Order-Count-Diff ≠ 0 **oder** Revenue-Diff > 0,5 %. Slack-Webhook bei jedem `MISMATCH`
- Täglicher Slack-Digest (im selben Job): fehlgeschlagene `WebhookEvent`s (`attempts ≥ 5`), Snippet-Fehler aus `/proxy/err` pro Shop, Sentry-Fehleranzahl. Reconciliation fängt Webhook-Ausfälle erst am Folgetag – der Digest ist das Frühwarnsystem
- `/jobs/retry-webhooks` (WP2) als Render Cron Job stündlich
- `POST /jobs/cleanup` (Render Cron Job, täglich 05:00, Secret-Header): löscht `WebhookEvent`-Zeilen mit `receivedAt` älter als 30 Tage und `Exposure`-Zeilen mit `firstSeenAt` älter als 12 Monate (Retention `rahmen.md` §3, ADR-0024); in Batches à 10 000, loggt die Anzahl; läuft nie für ein Experiment, das noch `RUNNING` ist (kann bei 12 Monaten nicht vorkommen – wenn doch, Slack-Hinweis statt Löschung)
- Bot-Filter härten: UA-Liste server-side, `isBot`-Exposures aus allen Aggregationen ausschließen, Dashboard zeigt Bot-Anteil pro Experiment

**Abnahme**
- Dev Store: 5 Bestellungen mit Attribut, 2 ohne → Reconciliation `OK` mit 5 = 5
- Eine Order manuell aus unserer DB löschen → nächster Lauf `MISMATCH`, Slack-Alert kommt
- Cleanup: je eine `WebhookEvent`- und `Exposure`-Row mit altem Datum anlegen → nach `/jobs/cleanup` weg, jüngere Rows unverändert

**Session-Prompt (EN)**
> Read CLAUDE.md and docs/plan.md WP6. Implement the daily reconciliation job (a secret-protected HTTP endpoint triggered by a Render Cron Job) comparing attributed orders in our DB against Shopify Admin GraphQL orders carrying the `_ab` custom attribute, persist ReconciliationRun, show it in the dashboard, and post to a Slack webhook on mismatch, plus a daily Slack digest (failed webhook events, snippet errors per shop, Sentry error count). Schedule /jobs/retry-webhooks hourly and add /jobs/cleanup (daily) that deletes WebhookEvent rows older than 30 days and Exposure rows older than 12 months in batches. Harden bot filtering server-side and exclude isBot exposures from all aggregations.

### WP7 – A/A-Test auf einem Kunden-Shop (14 Tage Laufzeit, ~1 Tag Arbeit) – Abnahme Phase 1

- Voraussetzung: App-Review und PCD-Approval liegen vor (WP-R); sonst Fallback aus §1 – Custom-Distribution-App nur für diesen einen Shop
- Voraussetzung: AVV mit dem Kunden unterschrieben; Consent-Tool des Kunden geprüft (bedient es `Shopify.customerPrivacy`?), `requireConsent` entsprechend gesetzt
- Ab hier: lokale Entwicklung nur noch gegen eine eigene Dev-DB, nie gegen Prod
- Install auf einem A+-Kunden mit gutem Traffic (Tierliebhaber oder Wunderwunsch), App Embed aktivieren, Snippet-Ladeverhalten und Lighthouse prüfen
- Experiment `aa-baseline`: zwei Varianten ohne Code, 50/50, Allocation 1.0, `plannedSampleSize` aus dem Rechner
- Täglich: Reconciliation `OK`, SRM p > 0.001, Bot-Anteil plausibel
- Nach 14 Tagen: **SRM bestanden, kein signifikanter Unterschied bei CR und RPV, jeder `MISMATCH` hat eine gefundene Ursache, kumulierte Revenue-Abweichung ≤ 0,5 %**
- Fällt ein Kriterium durch: Ursache finden, fixen, A/A neu starten. Kein Phase-2-Feature vorher.

---

## 6. CLAUDE.md – Vorlage fürs Repo (copy-paste)

```markdown
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
pnpm dev            # shopify app dev (tunnels to the dev store)
pnpm test           # vitest, all packages
pnpm build:snippet  # lib/snippet → extensions/sh-ab-embed/assets/shab.js
pnpm db:migrate     # prisma migrate dev
pnpm deploy         # shopify app deploy (extensions) – ask before running

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
```

---

## 7. Was Joel manuell macht (vor/neben WP1)

- [ ] Partner Dashboard: **zwei** Apps anlegen (`sh-ab-dev`, `sh-ab`; Distribution: Public, unlisted), Development Store anlegen, zweiten Dev Store für den Aktivierungs-Test
- [ ] Für WP-R: Privacy-Policy-Seite (auf sectionheroes.de), Support-E-Mail, App-Icon, Screenshots; eigener Test-Shop (kein Dev Store) für den Install-Test nach der Freigabe
- [ ] **Protected Customer Data Access, Level 1 beantragen** – heute; muss bis WP7 durch sein
- [ ] Render: Postgres-Instanz (Frankfurt) anlegen, interne und externe DB-URL notieren; Web Service (Starter, Frankfurt) mit dem GitHub-Repo verbinden, Env-Vars eintragen
- [ ] Google Cloud: OAuth-Client (Web) anlegen, Consent Screen "Internal" (Workspace); Client-ID und Secret als Render-Env-Vars
- [ ] Sentry-Projekt (free) anlegen
- [ ] AVV-Vorlage (Auftragsverarbeitung) für Kunden – vor WP7 unterschrieben
- [ ] Slack-Webhook-URL für Alerts erzeugen
- [ ] Git-Repo `sh-ab` anlegen, Devs einladen, `DESIGN.md` und Konzept nach `docs/` kopieren
- [ ] Pro Kunde vor dem Install: Consent-Tool und dessen Customer-Privacy-Integration prüfen, `requireConsent` festlegen (8.2)
- [ ] Für WP7: Kunden für den A/A-Test auswählen und informieren; Store Owner installiert per Install-Link

---

## 8. Offene Entscheidungen

Entschieden: Framework (Template; Polaris Web Components nur auf `/app/*`, Dashboard ohne Polaris – ADR-0029), Auth (Google OAuth direkt), Namespace (`$app:sh_ab`), Editor im UI (ja), UI-Sprache (Englisch), Hosting (8.1), Consent (8.2), Zahlenformat (8.3), Pooling (8.4), Visitor-ID (8.5, v3.8), Retention (8.6). Nichts mehr offen.

**8.1 Hosting – entschieden: Render Web Service (v3.3, ersetzt Firebase App Hosting aus v3).** Alles auf einer Plattform: App, Postgres und Cron im selben Render-Workspace in Frankfurt, DB über die interne URL. Kein zweites Cloud-Projekt, keine Blaze-Kreditkarte, kein Cloud-Run-Cold-Start. Was das kostet: Der Free-Plan schläft nach 15 min ohne Traffic ein und braucht 30 s+ zum Aufwachen – Shopify-Webhooks laufen dann in den 5-s-Timeout (Shopify retried zwar, aber ein Dev Store hat stundenlang keinen Traffic, Einschlafen wäre der Normalfall). Deshalb **Starter (~7 $/Monat) ab WP1**, keine Free-Phase. Starter = eine Instanz, kein Autoscaling – reicht für Phase 1 locker (Beacons sind winzige Requests, Webhooks kommen pro Order). Mehr Instanzen bei Bedarf manuell, dann greift §8.4 B. Cron: vier Render Cron Jobs – daily-stats, reconcile, retry-webhooks, cleanup – (Docker-Image `curlimages/curl`, je min. 1 $/Monat), die die secret-geschützten `/jobs/*`-Endpoints aufrufen – die Endpoints bleiben, damit man Jobs auch manuell anstoßen kann. Alternative ohne Extra-Services: `node-cron` im App-Prozess; geht nur, solange es genau eine Instanz gibt. Firebase entfällt komplett (v3.4: Google OAuth direkt).

**8.2 Consent-Verhalten – entschieden: pro Shop.** `Shop.requireConsent` legt fest, ob ein Shop nur mit Consent oder immer trackt; das ist eine Entscheidung pro Kunde, nicht des Tools. Technik: einzige Schnittstelle ist `Shopify.customerPrivacy` (`analyticsProcessingAllowed()`, Event `visitorConsentCollected`). Das Consent-Tool des Kunden muss diese API bedienen – Pandectes und Consentmo tun das nativ, Cookiebot über seine Shopify-App; wird beim Onboarding pro Kunde geprüft. Ohne Consent: kein Cookie, kein Bucketing, Control, kein Exposure, kein Attribut. Bekannter Bias: Consent-Verweigerer fehlen komplett und die Sample-Größe schrumpft je nach Banner um 20–40 % – steht als Hinweis im Report, sobald `requireConsent` aktiv ist. Default `false`.

**8.3 Zahlenformat bei englischer UI – entschieden (WP0, ADR-0022): UI-Text Englisch, Zahlen, Beträge und Daten `de-DE`** (`1.234,56 €`, `20.09.2026`, `Intl.NumberFormat`/`Intl.DateTimeFormat` mit `de-DE`). Kunden und Beträge sind deutsch. Alternative `en-GB`/`en-DE` verworfen – nur `Intl`-Aufrufe betroffen, bleibt umschaltbar. Eine Format-Helper-Datei, keine Inline-Locales.

**8.4 Connection Pooling – entschieden (WP0, ADR-0023): Option A.** `connection_limit=10&pool_timeout=5` in der Prisma-URL, eine Render-Starter-Instanz → max. 10 Verbindungen; `max_connections` des gewählten Plans in WP1 im Render-Dashboard ablesen und in `STATUS.md` notieren. Hintergrund: Mit Render Starter läuft genau eine Instanz, die Frage ist also entspannter als unter Cloud Run: `Instanzen × connection_limit` muss unter dem `max_connections` des Postgres-Plans bleiben (kleine Pläne: ~100, Render reserviert 10 davon) – mit einer Instanz trivial. Relevant wird es erst, wenn manuell hochskaliert wird (§8.1).

- *A – kein Pooler (Empfehlung für Phase 1).* `connection_limit=10&pool_timeout=5` in der Prisma-URL, eine Instanz → max. 10 Verbindungen. `pool_timeout` kurz, damit Beacons unter Last nicht hängen, sondern schnell scheitern.
- *B – Render PgBouncer (sobald mehr als eine Instanz).* Render Postgres hat auf bezahlten Plänen integriertes Pooling: Port 6432, Transaction-Mode, kostenlos. Runtime-URL mit `?pgbouncer=true&connection_limit=5` auf 6432, Migrationen über die Direct-URL auf 5432. Transaction-Mode verbietet Session-Features (Advisory Locks, LISTEN/NOTIFY, Temp Tables) – nutzen wir nicht. Der Wechsel ist nur eine Env-Var, deshalb kein Grund, jetzt schon damit anzufangen.
- *C – externer Pooler-Dienst.* Extra Kosten, extra Abhängigkeit. Nein.

WP1 setzt (1) `connection_limit=10&pool_timeout=5` in der Prisma-URL und (2) liest `max_connections` des Plans im Dashboard ab. ADR-0023.

**8.5 Visitor-Cookie unter Safari ITP – entschieden (21.09., Joel, ADR-0028): D, eigener JS-Cookie mit localStorage-Spiegel.** Regel in 4.4: Cookie `_shab_vid` → sonst `localStorage["_shab_vid"]` → sonst UUID v4; beide bei jedem Page Load mit 365 Tagen neu geschrieben (`SameSite=Lax`, Path `/`). `_shopify_y` wird nirgends mehr gelesen. Hintergrund: Safari kappt per JS gesetzte Cookies auf 7 Tage und löscht script-writable Storage nach 7 Tagen ohne Besuch – durch das Neuschreiben bei jedem Besuch trifft das nur Besucher, die länger als 7 Tage weg waren. **Akzeptierter Bias:** Diese Wiederkehrer werden neu gebucketed und können in der anderen Variante landen; das verdünnt den gemessenen Lift Richtung null (beide Arme enthalten Besucher, die schon die jeweils andere Variante gesehen haben). Ein falscher Winner entsteht daraus nie, weil Orders über das Cart-Attribut (4.1) immer die beim Kauf gesehene Variante tragen – das Tool misst konservativ. Verworfen:
- *A – `_shopify_y` (ADR-0009).* Wird seit 01.01.2026 nicht mehr gesetzt (Changelog 04.08.2025); der Ersatz `clientId` existiert nur im Web-Pixel-Sandbox (ADR-0099 e).
- *B – Cookie per HTTP über eine Kunden-Subdomain (CNAME → unser Service).* Wäre ITP-fest, kostet aber pro Kunde eine DNS-Änderung, Custom Domain + TLS auf Render und einen zweiten Endpoint außerhalb des App-Proxys. Bleibt der Nachrüstweg, falls der Bias in der Praxis zu groß wird – einziger Berührungspunkt ist die Snippet-Regel.
- *C – `Set-Cookie` über die App-Proxy-Response.* Shopify strippt den Header (ADR-0099 f).

**8.6 Retention bei `shop/redact` und Uninstall – entschieden.** `shop/redact` kommt 48 h nach dem Uninstall und verlangt das Löschen der Shop-Daten. Regel: `Order`, `OrderLineItem`, `Refund`, `Exposure`, `WebhookEvent`, `ReconciliationRun` und der Token werden gelöscht; `Shop`, `Experiment`, `Variant`, `AuditLog`, `decision`/`conclusion` und ein eingefrorener Ergebnis-Snapshot pro Experiment (`evaluate()`-Output als JSON, ohne Personenbezug) bleiben – das sind unsere Learnings. Ob aggregierte Kennzahlen unter "Shop-Daten" fallen, ist juristisch nicht abgesichert; bis jemand das Gegenteil sagt, gilt die Regel. Reinstall innerhalb 48 h: nichts wird gelöscht. Der Snapshot ist jetzt das Modell `ExperimentResult` (§3, v3.7).

*Offene juristische Notiz (aus `rahmen.md` 3.3, kein Task):* Ob der Shop-Bezug des Snapshots bei `shop/redact` pseudonymisiert werden darf und muss ("Shop D, Pet Supplies, ~1k Orders/Tag" statt Domain), damit die Learnings-Datenbank (Phase 2) bei Kündigung ihre Substanz behält, ist mit einem Anwalt zu klären. Bis dahin bleibt `ExperimentResult.shopId` stehen; die Frage hat keinen Einfluss auf Phase 1.

---

## 9. Ausblick Phase 2 und 3 (nur Stichpunkte, nicht Teil dieses Plans)

**Phase 2 – Nutzbar machen:** Targeting `utm`/`country`/`referrer`/`customerStatus` · Redirect-Experimente (`type: REDIRECT`, Template-Tests via `?view=`) · Sequential Testing (mSPRT) · Bootstrap-CI für RPV · Charts im Dashboard (handgeschriebene SVGs nach DESIGN.md) · MCP Server auf der bestehenden API · Learnings-Datenbank über alle Kunden · Mutual Exclusion zwischen Experimenten · Client-Ansicht im Dashboard (Rolle `CLIENT`, read-only Results der eigenen Shops, Einladung per Mail) · Cross-Device für eingeloggte Kunden über Customer-Metafield (aus Phase 3 vorgezogen) · Screenshot je Variante im `ExperimentResult`-Snapshot (Pflicht beim Stop, `rahmen.md` 3.2) · automatische Tainted-Day-Erkennung (Ingestion-Lücke > 30 min oder Verlust > 2 % → Tag automatisch in `taintedDays`, `rahmen.md` 7.2)

**Phase 3 – Preis- und Versandtests:** Shopify Functions als Extensions im selben Repo (Delivery Customization, Discount, Cart Transform – Preisänderung in beide Richtungen vorher gegen die Doku prüfen) · Functions lesen `cart.attribute("_ab")` und `$app:sh_ab.server` · `unitCost` aus `inventory_item.cost` für Profit-Metrik · Rechtliche Freigabe (PAngV § 11, UWG) vor dem ersten Live-Test
