# Rahmen – sh-ab, Phase 1

*Stand: 19.09.2026. Die Zahlen und Grenzen, gegen die Infrastruktur-Entscheidungen getroffen werden. Schätzungen, Größenordnung zählt. Was hier steht, gilt, bis es hier geändert wird. Das Warum steht in `konzept.md`, das Wie in `plan.md`, der aktuelle Stand in `STATUS.md`.*

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

Alle weiteren Punkte hier sind **Vorschlag, von Joel zu bestätigen**, und gehören danach als ADR ins Repo.

| Daten | Retention | Begründung |
|---|---|---|
| `WebhookEvent.payload` | Nur bei Fehler speichern | ~86 GB/Jahr bei voller Speicherung, sieht niemand an |
| `WebhookEvent` (Zeile) | 30 Tage, dann löschen | Nur für Idempotenz auf `X-Shopify-Webhook-Id` nötig; Shopifys Retry-Fenster ist deutlich kürzer |
| `Order.raw` | Dauerhaft, aber **schlank** | Volle Payloads ~30 KB → 16 GB/Jahr. Abspecken auf ~4 KB → 2 GB/Jahr |
| `Order` / `OrderLineItem` / `Refund` | Dauerhaft | Klein, Basis jeder Nachrechnung |
| `Exposure` | 12 Monate, dann löschen | ~9 GB/Jahr bei 6 Shops. Frist auch aus DSGVO-Gründen nötig |
| `DailyStat` | Dauerhaft | Klein, Grundlage der Learnings-Datenbank |
| `ExperimentResult` (neu, §3.2) | Dauerhaft, unveränderlich | Report unabhängig von Rohdaten |
| `AuditLog` | Dauerhaft | Klein, Nachvollziehbarkeit |

### 3.1 Schlankes `Order.raw`

Nicht der volle Shopify-Payload, sondern: `note_attributes`, `line_items` (id, variant_id, product_id, quantity, price, `properties`), `shipping_lines`, alle `*_price_set.shop_money`, `financial_status`, `cancelled_at`, `customer.id`.

Der volle Payload ist über die Shopify API jederzeit nachladbar, solange die App installiert ist. Dauerhafte Vollspeicherung ist damit doppelt.

### 3.2 Zwei Modell-Ergänzungen, die aus der Retention folgen

**`DailyStat` braucht `revenueSumSq` und `orderCount` – sofern die Stats-Engine aus DailyStat liest.** Der winsorized Welch t-test auf RPV braucht die Varianz, nicht nur Tagessummen. Das ist keine Retention-Frage (Tagesverläufe werden langfristig nicht gebraucht), sondern eine der Architektur: Liest `stats.server` das aggregierte DailyStat, müssen die Felder rein; rechnet es direkt auf Exposures und Orders, nicht. Vor WP-Start klären.

**Neues Modell `ExperimentResult`.** Beim Übergang auf `ENDED` wird das Ergebnis einmal berechnet und eingefroren. Danach hängt kein Report mehr an den Rohdaten. Trägt die zentrale Langzeit-Anforderung und ist deshalb der wichtigste Teil des Datenmodells.

Inhalt, als versioniertes JSON (`"v": 1`), ein paar KB pro Experiment:

*Zahlen* – je Variante n, Conversions, Umsatzsumme; p-Werte, Konfidenzintervalle, SRM-Ergebnis; Auswertungszeitraum, ausgeschlossene (tainted) Tage; `statsVersion`. Zusätzlich dieselben Kennzahlen je Device – beim Einfrieren kostenlos, im Nachhinein nicht mehr rekonstruierbar.

**Bewusst nicht enthalten:** Tagesverläufe und weitere Segmente (Land, Traffic-Quelle). Gefordert ist der Ausgang des Tests, nicht dessen Verlauf. Wer in zwei Jahren mehr wissen will als hier steht, hat Pech – das ist die Entscheidung.

*Was der Test war* – eingefrorene Kopie von Hypothese, Variantencode (js/css), Targeting, Allocation, Weights, Salt, Trigger, Laufzeit, Marker für Code-Änderungen während der Laufzeit. `Variant` ist editierbar; ohne Kopie ist in zwei Jahren nicht mehr nachvollziehbar, was gemessen wurde.

*Screenshot je Variante und Fazit in Prosa*, erfasst beim Beenden – **Pflichtfeld**. Da der Snapshot das Einzige ist, was langfristig überlebt, sind Bild und Kontext hier wertvoller als jede weitere Kennzahl. Eine Minute Handarbeit pro Test.

**Regel: Ergebnisse werden nie neu berechnet, nur gelesen.** Sonst zeigt ein alter Report nach einer Änderung an der Stats-Engine plötzlich andere Zahlen als damals berichtet.

### 3.3 DSGVO – offene Lücke im Plan

`Exposure` enthält visitorId, customerId, Referrer, UTM, Country – personenbezogene Daten.

- Die von Shopify vorgeschriebenen Compliance-Webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) fehlen bisher in Datenmodell und Arbeitspaketen. Spätestens für den PCD-Antrag nötig.
- Fristen und genaue Anforderungen mit dem Shopify Dev MCP gegen die aktuelle Doku prüfen.
- `shop/redact` löscht alle Daten des Shops – **außer** dem anonymen Ergebnis-Snapshot, dessen Shop-Bezug stattdessen pseudonymisiert wird ("Shop D, Pet Supplies, ~1k Orders/Tag"). Sonst verliert die Learnings-Datenbank (Phase 2) bei jeder Kündigung ihre Substanz. Juristisch zu bestätigen, nicht technisch zu entscheiden.
- Zusammen mit der Consent-Frage (`plan.md` §8.2) zu entscheiden.

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
- Einziger externer Blocker: Protected Customer Data Approval, muss bis WP7 vorliegen.

## 7. Verfügbarkeit und Risiko

**7.1 Downtime.** Bei Ausfall der App laufen die Kundenshops normal weiter – die Konfiguration liegt inline im Liquid (Metafield), das Snippet braucht die App zur Laufzeit nicht. Verloren gehen nur Exposure-Beacons. Orders werden von Shopifys Webhook-Retries nachgeliefert und von der Reconciliation aufgefangen.

Akzeptierte Ausfallzeit: **mehrere Stunden**, solange sie in die Tainted-Regel unten fällt.

**7.2 Tolerierbarer Datenverlust.** Regel: Lücke in der Exposure-Ingestion > 30 min, oder Verlust > 2 % der erwarteten Exposures an einem Tag → Tag wird als `tainted` markiert, aus dem Auswertungsfenster ausgeschlossen, Laufzeit entsprechend verlängert. Flag am Experiment, Anzeige im Report. Order-Daten sind hiervon nicht betroffen.

**7.3 Snippet bricht einen Kundenshop.** Erkennung heute: Kunde oder Joel merkt es. Fix sofort. Kill Switch ist das Metafield-Update (Experiment raus = Snippet tut nichts).

Das ist der schwächste Punkt im ganzen Setup: Bei einem kaputten PDP ist "der Kunde merkt es" genau der Schaden, der vermieden werden soll. Deshalb Sentry (§8) als einzige nicht verhandelbare Monitoring-Komponente.

**7.4 SLAs.** Keine vertraglichen Zusagen gegenüber Kunden, die hierdurch berührt werden.

## 8. Betrieb – bewusst minimal

Niemand schaut täglich in ein Monitoring. Kein Slack. Daraus folgt: Das System muss dort warnen, wo ohnehin jemand hinschaut – im Dashboard.

**Im Dashboard, beim Laden berechnet, keine zusätzliche Infrastruktur:**
Roter Badge am Experiment bei SRM p < 0,001 · keine Exposures in den letzten 24 h · Reconciliation-Abweichung > 2 % · Snippet-Fehler über Schwelle. In der Shop-Übersicht aggregiert, damit ein Blick reicht.

**Sentry (Free Tier)** für Server-Fehler und Snippet-Fehler. Die einzige Ausnahme von "nicht overengineeren", Begründung in 7.3.

**Nicht bauen:** Slack-Alerts, Dashboards über Sentry hinaus, Uptime-Monitoring, On-Call, Log-Aggregation. Der Slack-Webhook aus `plan.md` §7 entfällt.

## 9. Was daraus für die Architektur folgt

1. **Connection Pooling (`plan.md` §8.4) ist ein kleines Thema.** Bei < 10 req/s reicht: `maxInstances` auf 3 deckeln, `connection_limit=5` pro Instanz → max. 15 Verbindungen. Kein PgBouncer, kein Accelerate.
2. **Hosting-Entscheidung (§8.1) neu bewerten.** Sie war mit dem Free-Quota begründet; Kosten sind laut §4 nachrangig. Ohne dieses Argument sprechen Cold Starts, Cross-Cloud-Verbindung zur Render-DB, zweiter Provider und der nicht vorkonfigurierte Node-Pfad für React Router 7 gegen Firebase App Hosting. Ein immer laufender Render Web Service liegt im selben Netz wie die DB, hat keine Cold Starts und keinen zweiten Betriebsstrang. Firebase Auth bleibt davon unberührt. Cron dann über Render Cron Jobs statt Cloud Scheduler.
3. **DB-Dimensionierung:** Storage ist der einzige wachsende Posten. Mit der Retention aus §3 landet man bei grob 12–15 GB im ersten Jahr. Compute ist bei dieser Last unkritisch, der kleinste sinnvolle Plan genügt.
4. **Keine Peak-Auslegung nötig** (§1).
5. **Ein Betreiber** (§5): im Zweifel die langweiligere, wartungsärmere Variante.

---

## Offen

- [ ] Retention (§3) bestätigen, dann ADR
- [ ] Pseudonymisierung bei `shop/redact` (§3.3) juristisch klären
- [ ] `DailyStat`-Felder und `ExperimentResult` in `plan.md` §3 aufnehmen
- [ ] DSGVO-Webhooks (§3.3) als Arbeitspaket ergänzen, Fristen gegen Shopify-Doku prüfen
- [ ] Hosting (§9.2) neu entscheiden, ADR aktualisieren
- [ ] `plan.md` §8.4 (Pooling) mit der Empfehlung aus §9.1 schließen
