# Rahmen – sh-ab, Phase 1

*Stand: 20.09.2026 (abgeglichen mit `plan.md` v3.7). Die Zahlen und Grenzen, gegen die Infrastruktur-Entscheidungen getroffen werden. Schätzungen, Größenordnung zählt. Was hier steht, gilt, bis es hier geändert wird. Das Warum steht in `konzept.md`, das Wie in `plan.md`, der aktuelle Stand in `STATUS.md`.*

---

## 1. Last

| | Phase 1 (3 Shops) | 12 Monate (6 Shops) |
|---|---|---|
| Sessions/Tag je Shop | 5.000–8.000 | unverändert |
| Experimente gleichzeitig je Shop | 3 | 3 |
| Exposures/Tag gesamt | ~25.000 | ~50.000 |
| Orders/Tag gesamt | ~1.500 | ~3.000 |
| Webhook-Calls/Tag gesamt | ~8.000 | ~16.000 |
| Peak-Rate | < 5 req/s | < 10 req/s |

- Orders je Shop: größter ~1.000/Tag, übrige 150–300/Tag.
- Webhook-Schätzung: `orders/create` + 4–6× `orders/updated` + `refunds/create` je Order.
- **Black Friday: ca. +10 %.** Die Kunden sind nicht saisonspitzen-getrieben. Es gibt keine Peak-Planung und keinen Bedarf an Autoscaling-Headroom.
- Das Snippet lädt auf allen Seiten (App Embed Block im `head`) und filtert selbst. Targeting pro Experiment ist in der Regel genau ein Seitentyp (PDP, Collection, Cart).
- Exposure wird einmal pro Visitor pro Experiment gesendet, und erst wenn die Variante angewendet bzw. sichtbar war.

**Folgerung:** Eine einzelne Instanz bedient die komplette Last. Skalierung ist kein Thema in Phase 1.

## 2. Shops

- Start: 3 (A/A-Test + direkt danach)
- 12 Monate: 6
- Begrenzt auf Bestandskunden der Agentur. Kein Self-Service, keine automatische Ausrollung an Neukunden.
- Mandantenfähigkeit wird gebraucht (mehrere Shops in einem Dashboard), Multi-Tenancy im Sinne fremder Organisationen nicht. Siehe Weggabelung in `konzept.md`.

## 3. Datenhaltung

**Kernanforderung: Testergebnisse müssen dauerhaft abrufbar sein, Horizont mindestens 2 Jahre.** Das ist die härteste Anforderung in diesem Dokument und steht im Konflikt mit der DSGVO-Löschfrist für Rohdaten (§3.3). Aufgelöst wird sie über den unveränderlichen, anonymen Ergebnis-Snapshot (§3.2): Er enthält keine personenbezogenen Daten, bleibt dauerhaft, und die Rohdaten darunter dürfen verschwinden. Ohne diesen Snapshot müsste man sich zwischen Ergebnis-Historie und Rechtskonformität entscheiden.

Die Retention-Tabelle ist **bestätigt** (20.09., ADR-0024); der Cleanup-Job dazu liegt in `plan.md` WP6 (`/jobs/cleanup`).

| Daten | Retention | Begründung |
|---|---|---|
| `WebhookEvent.payload` | Nur bei Fehler speichern | ~86 GB/Jahr bei voller Speicherung, sieht niemand an |
| `WebhookEvent` (Zeile) | 30 Tage, dann löschen | Nur für Idempotenz auf `X-Shopify-Webhook-Id` nötig; Shopifys Retry-Fenster ist deutlich kürzer |
| `Order.raw` | Dauerhaft, aber **schlank** | Volle Payloads ~30 KB → 16 GB/Jahr. Abspecken auf ~4 KB → 2 GB/Jahr |
| `Order` / `OrderLineItem` / `Refund` | Dauerhaft | Klein, Basis jeder Nachrechnung |
| `Exposure` | 12 Monate, dann löschen | ~9 GB/Jahr bei 6 Shops. Frist auch aus DSGVO-Gründen nötig |
| `DailyStat` | Dauerhaft | Klein, Grundlage der Learnings-Datenbank |
| `ExperimentResult` (§3.2) | Dauerhaft, unveränderlich | Report unabhängig von Rohdaten; wird bei `shop/redact` nicht gelöscht (`plan.md` 8.6) |
| `AuditLog` | Dauerhaft | Klein, Nachvollziehbarkeit |

### 3.1 Schlankes `Order.raw`

Nicht der volle Shopify-Payload, sondern: `note_attributes`, `line_items` (id, variant_id, product_id, quantity, price, `properties`), `shipping_lines`, alle `*_price_set.shop_money`, `financial_status`, `cancelled_at`, `customer.id`.

Der volle Payload ist über die Shopify API jederzeit nachladbar, solange die App installiert ist. Dauerhafte Vollspeicherung ist damit doppelt.

### 3.2 Ergebnis-Snapshot `ExperimentResult`

*(Die frühere Frage nach `DailyStat.revenueSumSq` ist erledigt: Die Stats-Engine rechnet live auf `Exposure`/`Order` (`plan.md` v3.2), `DailyStat` ist nur Historie. Keine Zusatzfelder nötig.)*

**Modell `ExperimentResult` – Phase 1, in `plan.md` §3 aufgenommen (ADR-0025).** Beim Übergang auf `ENDED` wird das Ergebnis einmal berechnet und eingefroren. Danach hängt kein Report mehr an den Rohdaten. Trägt die zentrale Langzeit-Anforderung und ist deshalb der wichtigste Teil des Datenmodells.

Inhalt, als versioniertes JSON (`"v": 1`), ein paar KB pro Experiment:

*Zahlen* – je Variante n, Conversions, Umsatzsumme; p-Werte, Konfidenzintervalle, SRM-Ergebnis; Auswertungszeitraum, ausgeschlossene (tainted) Tage; `statsVersion`. Zusätzlich dieselben Kennzahlen je Device – beim Einfrieren kostenlos, im Nachhinein nicht mehr rekonstruierbar.

**Bewusst nicht enthalten:** Tagesverläufe und weitere Segmente (Land, Traffic-Quelle). Gefordert ist der Ausgang des Tests, nicht dessen Verlauf. Wer in zwei Jahren mehr wissen will als hier steht, hat Pech – das ist die Entscheidung.

*Was der Test war* – eingefrorene Kopie von Hypothese, Variantencode (js/css), Targeting, Allocation, Weights, Salt, Trigger, Laufzeit, Marker für Code-Änderungen während der Laufzeit. `Variant` ist editierbar; ohne Kopie ist in zwei Jahren nicht mehr nachvollziehbar, was gemessen wurde.

*Fazit in Prosa* (`decision` + `conclusion` am Experiment), erfasst beim Beenden – **Pflichtfeld**, wird in den Snapshot kopiert. Der *Screenshot je Variante* ist Phase 2 (`plan.md` §9); da der Snapshot das Einzige ist, was langfristig überlebt, bleibt er auf der Liste.

**Regel: Ergebnisse werden nie neu berechnet, nur gelesen.** Sonst zeigt ein alter Report nach einer Änderung an der Stats-Engine plötzlich andere Zahlen als damals berichtet. Berechnung: `evaluate()` in WP4; Einfrieren und Anzeige: WP5.

### 3.3 DSGVO

`Exposure` enthält visitorId, customerId, Referrer, UTM, Country – personenbezogene Daten. Deshalb die 12-Monats-Frist oben.

- Compliance-Webhooks (`customers/data_request`, `customers/redact`, `shop/redact`): **erledigt** – Subscriptions in WP1, Handler in WP2 (seit `plan.md` v3.4). Fristen laut Shopify-Doku (ADR-0099 h): 200 sofort, Erledigung innerhalb 30 Tagen; `shop/redact` kommt 48 h nach Uninstall.
- `shop/redact` löscht nach `plan.md` 8.6: Rohdaten weg, Shop/Experiment/Variant/AuditLog/`ExperimentResult` bleiben.
- **Offen (juristisch, nicht technisch):** ob der Shop-Bezug des Snapshots bei `shop/redact` pseudonymisiert werden darf ("Shop D, Pet Supplies, ~1k Orders/Tag"), damit die Learnings-Datenbank (Phase 2) bei Kündigung ihre Substanz behält. Steht als Notiz in `plan.md` 8.6.

## 4. Budget

- Infra-Kosten sind **nachrangig**. Jede realistische Variante ist günstiger als die Lizenz eines kommerziellen A/B-Testing-Tools.
- Das Tool läuft im Retainer mit und ist Verkaufsargument, keine eigene Position gegenüber Kunden.
- **Kostenargumente sind damit kein gültiger Grund für technische Entscheidungen.** Einfachheit, Betriebsaufwand und Datenqualität schlagen Preis.
- Einziger Kostentreiber mit echtem Wachstum ist DB-Storage (Render: pro GB/Monat, separat von Compute, **kann nur erhöht, nie reduziert werden**). Deshalb konservativ provisionieren und mitwachsen.

## 5. Team

- Gebaut wird von Joel mit Claude Code. Shayem als Sparringspartner und Review.
- Betrieb und Ansprechpartner danach: Joel.
- Zeit: ausreichend, kein limitierender Faktor.
- **Folgerung:** Eine Person hält das langfristig am Laufen. Jede Komponente, die eigenes Betriebswissen braucht, ist eine Belastung. Im Zweifel die langweiligere Variante.

## 6. Zeit

- Kein harter Termin, läuft nebenher.
- A/A-Test startet, wenn WP1–6 stehen.
- Kein auslaufender Vertrag erzwingt einen Wechsel.
- Einziger externer Blocker: Shopify App Review + Protected Customer Data Approval (`plan.md` WP-R), müssen bis WP7 vorliegen.

## 7. Verfügbarkeit und Risiko

**7.1 Downtime.** Bei Ausfall der App laufen die Kundenshops normal weiter – die Konfiguration liegt inline im Liquid (Metafield), das Snippet braucht die App zur Laufzeit nicht. Verloren gehen nur Exposure-Beacons. Orders werden von Shopifys Webhook-Retries nachgeliefert und von der Reconciliation aufgefangen.

Akzeptierte Ausfallzeit: **mehrere Stunden**, solange sie in die Tainted-Regel unten fällt.

**7.2 Tolerierbarer Datenverlust.** Regel: Lücke in der Exposure-Ingestion > 30 min, oder Verlust > 2 % der erwarteten Exposures an einem Tag → Tag wird als `tainted` markiert, aus dem Auswertungsfenster ausgeschlossen, Laufzeit entsprechend verlängert. Order-Daten sind hiervon nicht betroffen.

Phase 1 (ADR-0026): **manuelles Flag** `Experiment.taintedDays` (Liste von Datumswerten), im Dashboard setzbar (WP5), in `stats.server` aus dem Auswertungsfenster ausgeschlossen (WP4), im Report und im Snapshot sichtbar. Wer die Lücke bemerkt (Sentry, Dashboard-Badge "keine Exposures 24 h", Digest), trägt den Tag ein. Automatische Erkennung ist Phase 2 (`plan.md` §9).

**7.3 Snippet bricht einen Kundenshop.** Erkennung heute: Kunde oder Joel merkt es. Fix sofort. Kill Switch ist das Metafield-Update (Experiment raus = Snippet tut nichts).

Das ist der schwächste Punkt im ganzen Setup: Bei einem kaputten PDP ist "der Kunde merkt es" genau der Schaden, der vermieden werden soll. Deshalb Sentry (§8) als einzige nicht verhandelbare Monitoring-Komponente.

**7.4 SLAs.** Keine vertraglichen Zusagen gegenüber Kunden, die hierdurch berührt werden.

## 8. Betrieb – bewusst minimal

Niemand schaut täglich in ein Monitoring. Daraus folgt: Das System muss dort warnen, wo ohnehin jemand hinschaut – im Dashboard und in Slack (ADR-0027).

**Im Dashboard, beim Laden berechnet, keine zusätzliche Infrastruktur:**
Roter Badge am Experiment bei SRM p < 0,001 · keine Exposures in den letzten 24 h · Reconciliation-Abweichung > 2 % · Snippet-Fehler über Schwelle. In der Shop-Übersicht aggregiert, damit ein Blick reicht.

**Slack (ein Incoming Webhook, `plan.md` WP6 und §7):** Nachricht bei jedem Reconciliation-`MISMATCH` und ein täglicher Digest (fehlgeschlagene Webhook-Events, Snippet-Fehler pro Shop, Sentry-Fehleranzahl, neue `PENDING`/`ACTIVE`-Shops). Der Digest ist das Frühwarnsystem – die Reconciliation fängt Webhook-Ausfälle erst am Folgetag.

**Sentry (Free Tier)** für Server-Fehler und Snippet-Fehler. Begründung in 7.3.

**Nicht bauen:** Dashboards über Sentry hinaus, Uptime-Monitoring, On-Call, Log-Aggregation, Alerting-Regeln jenseits von Badge + Slack-Webhook.

## 9. Was daraus für die Architektur folgt

1. **Connection Pooling – entschieden (`plan.md` 8.4 Option A, ADR-0023).** Bei < 10 req/s und genau einer Render-Starter-Instanz reicht `connection_limit=10&pool_timeout=5` in der Prisma-URL → max. 10 Verbindungen, weit unter `max_connections` des kleinsten Postgres-Plans. Kein PgBouncer, kein Accelerate. Render PgBouncer (Option B) erst, wenn manuell auf mehr als eine Instanz skaliert wird – der Wechsel ist eine Env-Var.
2. **Hosting – entschieden (`plan.md` 8.1, v3.3, ADR-0007):** Render Web Service (Starter, Frankfurt), im selben Netz wie die DB, keine Cold Starts, Cron über Render Cron Jobs. Firebase ist komplett raus – Dashboard-Login per Google OAuth direkt (v3.4, ADR-0008).
3. **DB-Dimensionierung:** Storage ist der einzige wachsende Posten. Mit der Retention aus §3 landet man bei grob 12–15 GB im ersten Jahr. Compute ist bei dieser Last unkritisch, der kleinste sinnvolle Plan genügt.
4. **Keine Peak-Auslegung nötig** (§1).
5. **Ein Betreiber** (§5): im Zweifel die langweiligere, wartungsärmere Variante.

---

## Offen

- [ ] Pseudonymisierung bei `shop/redact` (§3.3) juristisch klären – Notiz in `plan.md` 8.6
- [x] Visitor-ID: entschieden 21.09.2026 (ADR-0028, `plan.md` 8.5 Option D – JS-Cookie mit localStorage-Spiegel, akzeptierter Bias Richtung null)
