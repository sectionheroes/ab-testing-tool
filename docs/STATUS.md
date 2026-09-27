# Status
Stand: 2026-09-27 (Session pausiert, wird fortgesetzt)

## Aktuell
WP: **WP4.1 zu ~85 % fertig**, Branch `wp4.1-visitor-binding`, gepusht, **noch kein PR**. Rein lokal, kein Dev-Store,
kein Shopify-Call. WP4-PR (#4) ist gemerged.

**Fertig und grün:** `_ab_v` im Snippet (4.1b), iPadOS-Device-Heuristik, `n`/`isNewVisitor` (ADR-0035), `_ab_v`-Ingest
nach `OrderAttribution.visitorId`, Aggregation mit Visitor-Join und `unknown` als viertem Device-Bucket (ADR-0033),
`classifyChannel` (4.10), `breakdown(experiment, dimension, opts)` über day/device/visitorType/channel plus
`day × dimension`, Stopp-Regel nach ADR-0036 statt `plannedSampleSize`, `setStoppingRule` mit der Verschärfen-nur-Sperre
(4.6), Rechner beidseitig, `STATS_VERSION` 2.0.0. **465 Unit-Tests, 73 DB-Tests, typecheck und lint sauber; A/A bei
4,98 % (CR) und 5,36 % (RPV); Snippet 3.647 B gzip von 8.192 (45 %).**

**Offen – genau zwei Dinge:** die Lasttest-Zahlen (unten) und die Abschlussarbeiten
(`lib/stats/README.md`, plan.md/ADR-Pflege, WP4.1-Abnahmeliste, PR).

## Lasttest – über dem Ziel, das ist der offene Punkt
`pnpm seed:load` (1 Mio. Exposures, 30 k Orders, 30 Tage, `Europe/Berlin`), danach `VACUUM ANALYZE`, dann
`pnpm measure:load` (neues Skript, misst gegen eine bestehende Fixture ohne neu zu seeden). Ziel: < 500 ms.

| Fall | Median | |
|---|---|---|
| `evaluate()` (Hauptaggregation) | **511 ms** | über Ziel; WP4 hatte 396 ms |
| `breakdown("device")` | 524 ms | |
| `breakdown("visitorType")` | 529 ms | |
| `breakdown("day")` | 615 ms | |
| `breakdown("channel")` | **1.239 ms** | schlechtester Fall |
| `device × day` / `visitorType × day` | 673 / 694 ms | |
| `channel × day` | 1.205 ms | |

**Die Zahlen sind nicht mit WP4 vergleichbar.** Die alte Fixture hatte `referrer` und `utm` leer; meine füllt beide, weil
die Channel-Dimension sonst nichts zu gruppieren hat. Dadurch ist `Exposure` 252 MB Heap statt eines Bruchteils, und
jeder Heap-Zugriff kostet entsprechend. Zusätzlich ist die Fixture **zu pessimistisch**: ich habe Referrer mit
eindeutigem Pfad je Zeile erzeugt (1 Mio. verschiedene Strings), echte `document.referrer`-Werte fallen überwiegend auf
eine Handvoll Hosts zusammen. Das gehört korrigiert, bevor die Zahl bewertet wird.

**Was gemessen und schon behoben ist:**
- Der Customer-Lateral lief 29.397× ins Leere, obwohl 80 % der Orders `_ab_v` tragen → `co.visitor_id IS NULL`
  davorgesetzt, ~60 ms.
- Der Channel-Query hat `utm->>'source'`, `utm->>'medium'` und `utm::text <> '{}'` je Zeile ausgewertet: 294 ms → 758 ms
  allein dafür. Jetzt wird das rohe `utm`-jsonb gruppiert und `classifyChannel` bekommt das echte Objekt — schneller und
  näher an 4.10.
- **Falle 2 hat wieder zugeschlagen, und ich bin zuerst hineingelaufen.** Ich hatte den Tag per
  `(firstSeenAt AT TIME ZONE 'UTC' AT TIME ZONE tz)::date` gruppiert mit dem Argument, ein Gruppierungsschlüssel filtere
  nicht und verhindere den Index-Only-Scan nicht. Der Scan blieb tatsächlich index-only, **aber** der berechnete
  Schlüssel ist nicht in Indexordnung lesbar, also sortiert Postgres 1 Mio. Zeilen und spillt 4 MB je Worker auf Platte.
  Jetzt Join gegen eine kleine `VALUES`-Liste von UTC-Tagesintervallen, wie CLAUDE.md es vorschreibt. Tainted Days
  fallen dabei einfach aus der Liste.

**Wo die Zeit jetzt noch steckt (EXPLAIN des echten generierten Queries, 587 ms):**
Der **Order-Teil ist der gemeinsame Flaschenhals** – er läuft in `evaluate()` *und* in jeder Dimension. Zwei Befunde aus
dem Plan, beide noch nicht behoben:
1. `Heap Fetches: 27162` auf dem Exposure-Index-Only-Scan. Nach `VACUUM ANALYZE` sollten das 0 sein – die Visibility Map
   ist offenbar nicht vollständig, weil die Messläufe direkt nach dem Seed liefen. **Erst prüfen, ob ein zweites
   `VACUUM` das erledigt**, bevor irgendetwas anderes optimiert wird.
2. Der `kc`-Lateral hat einen `Sort` über `Exposure_customerId_idx` (`ORDER BY firstSeenAt LIMIT 1`), 28.310 Schleifen.
   Ein Index `(experimentId, customerId, variantId, firstSeenAt)` würde den Sort und den Filter sparen – zu prüfen
   gegen die Storage-Kosten (rahmen §4).

**Nächster Schritt, in dieser Reihenfolge:** (a) Fixture realistisch machen (kurze, wiederholte Referrer-Hosts, UTM auf
~25 % der Zeilen), neu seeden, zweimal `VACUUM`, neu messen; (b) die beiden Punkte oben; (c) falls `channel` danach
weiter über 500 ms liegt, ist das eine **Entscheidung für Joel**: entweder denormalisierte Spalten `referrerHost`,
`utmSource`, `utmMedium` auf `Exposure` für einen deckenden Index (die Klassifikation bliebe Code, nur die Eingaben
würden normalisiert – 4.10 wäre gewahrt), oder die Zahl wird akzeptiert und dokumentiert. 1 Mio. Exposures in *einem*
Experiment sind ~10× über dem, was rahmen §1 für den größten Shop hergibt.

## Befunde außerhalb der Performance
- **Vier Docs-Commits waren nie gepusht.** Der Squash-Merge von PR #4 hat nur den WP4-Code genommen; plan.md v4.3,
  ADR-0033–0037, das DESIGN.md-Update und die neue CLAUDE.md fehlten auf `main`. Lokal auf `wp4-stats` noch vorhanden,
  per Cherry-Pick auf diesen Branch geholt, jetzt gepusht. **Sie landen über den WP4.1-PR auf `main`** – vorher ist
  `main` unvollständig.
- **`_ab_v` ist als Cart Attribute nicht dokumentiert privat.** Die Dev-MCP-Doku belegt die Unterstrich-Regel
  („versteckt vor Cart, Checkout, Kundenansicht, gedruckten und gemailten Belegen") für **Line Item Properties**. Für
  **Cart Attributes** ist die dokumentierte private Form der **doppelte** Unterstrich (`__`), und die ist über die Ajax
  API nicht lesbar, also für uns unbrauchbar. Betrifft `_ab` (4.1, frozen, seit WP3 live) genauso und ändert an der
  Implementierung nichts – aber die WP4.1-Abnahmezeile „`_ab_v` erscheint nicht in der Bestellbestätigungs-Mail" steht
  auf einer Annahme, die die Doku nur zur Hälfte deckt. **Nur mit einer echten Order im Dev Store zu klären.**
- Die Device-Link-Rate springt von **31 % auf 86 %** – genau das, wofür ADR-0033 gebaut wurde.
- `timezone.ts` liegt jetzt in `lib/stats/`, weil `evaluate()` dieselbe Kalendertags-Arithmetik für die Stopp-Regel
  braucht und `lib/` nicht aus `app/` importieren darf. `app/services/timezone.ts` re-exportiert nur noch.

## Lokale DB
Eine Load-Fixture (`loadtest-20260927211150`, 1 Mio. Exposures, 517 MB inkl. Indizes) plus die zwei Dev-Store-Shops.
`pnpm seed:load` löscht nie etwas; Aufräumen ist bewusst nicht angefasst (CLAUDE.md).

## Offen (unverändert aus WP4)
- Retention für `SnippetError` und `Exposure` in `/jobs/cleanup` (WP6); Cron für `/jobs/daily-stats` ebenfalls WP6.
- Lasttest auf Render nach dem DB-Upgrade vor WP7 wiederholen (dort 0,1 CPU – die Zahlen oben sind Laptop-Zahlen).
- Item h (Lighthouse) und die `test = false`-Order nur auf einem echten Store möglich (WP7).
- Secret-Rotation bei der Proxy-Signatur (ADR-0031); Review-Risiko non-embedded Dashboard (ADR-0099 c/g);
  Pseudonymisierung bei `shop/redact` (plan 8.6); PCD-Antrag vor WP-R.
- Prod-DB (Render) vor WP7 sauber neu aufsetzen.
- Die WP5b-Blocker aus plan.md v4.3 (Designsystem, zwei fehlende DESIGN.md-Rezepte) sind unberührt.
