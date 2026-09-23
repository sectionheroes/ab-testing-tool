# Status
Stand: 2026-09-23

## Aktuell
WP: **WP4 fertig** (Stats-Engine, A/A-Simulation, Live-Aggregation, Snapshot, DailyStat-Job), Branch `wp4-stats`,
PR gegen `main` offen. Rein lokal – kein Dev-Store, kein Shopify-Call. Nächste Session: **WP5** (Dashboard, Editor,
API, CLI). WP-R läuft parallel.

## Abnahme WP4
| # | Item | Ergebnis |
|---|---|---|
| a | Referenztests mit Quellenangabe | **pass** – z-Test OpenStax *Intro Stats 2e* §10.3 (10.8/10.9/10.10), Welch NIST §7.3.1 (`t = 2.2694`, `ν = 15.5325`), Chi² OpenStax §11.2 (11.2/11.3/11.4); alle auf 4 Nachkommastellen, jede Zahl zusätzlich mit scipy 1.13.1 gegengerechnet |
| b | A/A-FPR im Band, Zahlen in `lib/stats/README.md` | **pass** – CR **4,98 %**, RPV **5,36 %** (je 10.000 Läufe, seeded); vier weitere Seeds 4,54–5,20 % |
| c | `significant: false` unter `plannedSampleSize` trotz p < 0,001 | **pass** – expliziter Test in `lib/stats/test/evaluate.test.ts` und gegen echte Daten in `stats.server.db.test.ts` |
| d | Tainted Day entfernt genau diesen Tag | **pass** – DB-Test mit gesetzten Daten, Grenzfälle 21:00 Z / 23:00 Z / 22:30 Z gegen `Europe/Berlin`; gegen die 1-Mio-Fixture exakt gegen SQL-Ground-Truth geprüft |
| e | Lasttest-Zahlen | **pass** – **396 ms Median** bei 1 Mio. Exposures / 30 k Orders (Details unten) |
| f | `pnpm test`, typecheck, lint grün | **pass** – 311 Unit-Tests (15 s), 30 DB-Tests, typecheck und lint sauber |

## Lasttest (lokal, `pnpm seed:load`)
1 Mio. Exposures, 30 k Orders, 1,5 k Refunds, 30 Tage, `Europe/Berlin`, Device-Link-Rate 31 %.

| Fall | Median | Anmerkung |
|---|---|---|
| ohne Tainted Days | **376 ms** | |
| ein Tainted Day | **398 ms** | |
| direkt nach dem Seed, eine Fixture in der Tabelle | **396 ms** | |

Gemessen auf **lokalem Postgres 17** (Homebrew, M-Laptop) mit **3 Mio. Exposure-Zeilen insgesamt** (drei Fixtures),
davon 1 Mio. im gemessenen Experiment – die Zahl ist also eher pessimistisch. **Render-Prod hat 0,1 CPU; die Zahl,
die zählt, wird nach dem DB-Upgrade vor WP7 neu gemessen.**

Zwei Dinge haben die Query von 528 s auf unter 400 ms gebracht, beide sind Fallen für die nächste Session:
- **Kein Lateral-Join gegen eine materialisierte CTE.** Die Exposure-Suche je Order lief gegen eine CTE mit 1 Mio.
  Zeilen → 30 k × Full Scan. Direkt gegen `"Exposure"` nutzt sie `Exposure_customerId_idx`.
- **Tainted Days als UTC-Bereich, nicht als `to_char(...)`.** Der String-Vergleich je Zeile kostete ~130 ms und
  verhindert den Index-Only-Scan. `app/services/timezone.ts` rechnet den lokalen Tag in sein UTC-Intervall um (DST
  getestet: 23-h- und 25-h-Tage).

Neuer Index `Exposure(experimentId, variantId, device, isBot, firstSeenAt)`, Migration
`20260922210000_wp4_exposure_stats_index`: Parallel Seq Scan 136 ms → **Index-Only-Scan 43 ms**. Index-Only braucht die
Visibility Map – nach einem Bulk-Load einmal `VACUUM` laufen lassen, sonst ist er langsamer als der Seq Scan.

## Befunde (wichtig für WP5 und WP7)
- **Order → Visitor ist nicht auflösbar (ADR-0032, neu).** Nichts verbindet eine Order mit einer `visitorId`: 4.1
  trägt nur `<experiment>:<variant>`, `Exposure.customerId` nur für eingeloggte Besucher. Eine Conversion ist deshalb
  eine **Identität**: `Order.customerId`, sonst die Order selbst. Mehrfachkäufe eines eingeloggten Kunden zählen
  einmal, Mehrfachkäufe eines Gasts ohne Customer-ID mehrfach – kleine CR-Verzerrung nach oben, in beiden Armen
  gleich. `evaluate()` kappt Konverter auf Visitors und warnt. **Vorgabe an WP5:** Device-Zahlen für Orders gibt es
  nur für verknüpfbare Orders (`deviceLinkRate`, hier 31 %); Visitors je Device sind exakt. Das muss im UI stehen.
- **Prisma bindet `Date` in Raw-SQL als `timestamptz`.** Die Spalten sind `timestamp(3) without time zone` mit UTC –
  der Vergleich wird in der Session-Zeitzone umgedeutet. Lokal (Berlin) verschiebt das jede Grenze um 1–2 h, auf
  Render (UTC) nicht: es sieht lokal falsch aus und wäre in Prod richtig, oder umgekehrt. Hat im Tainted-Day-Test
  zuerst falsche Zahlen erzeugt. Fix: `utcTimestamp()` in `stats.server.ts`, Regel steht in CLAUDE.md.
- **Der Sample-Size-Rechner ist für RPV optimistisch.** Gemessen: bei dem n, das er ausgibt, liegt die echte Power auf
  zero-inflated lognormalem Umsatz bei **71,6 %** statt 80 %. Zwei Gründe, beide in der von plan WP4 vorgegebenen
  Formel angelegt (gleiche σ in beiden Armen; Varianznäherung mit höchstens einer Order je Visitor). Für RPV-Tests
  aufrunden. Der Abstand ist durch einen Test festgenagelt und in `lib/stats/README.md` dokumentiert.
- **Winsorisierung kostet ~0,2 pp FPR.** Gemeinsam über beide Arme (4.8) 5,36 %, ohne 5,16 %. Bleibt klar im Band,
  ein Arm-eigener Cap wäre statistisch billiger und ist ausdrücklich nicht, was der Vertrag sagt.
- **CI gibt es jetzt** (`.github/workflows/ci.yml`): typecheck, lint, `pnpm test`, `pnpm test:db` mit
  Postgres-Service-Container bei jedem PR. Die A/A-Simulation läuft in 15 s und bleibt deshalb in der Default-Suite –
  es gibt keine `test:slow`. Die DB-Tests laufen je Fall in einer zurückgerollten Transaktion und löschen nie eine Zeile.

## Lokale DB – aufräumen ist deine Entscheidung
`pnpm seed:load` löscht nie etwas, jeder Lauf legt einen neuen Shop an. In `sh_ab_dev` liegen jetzt **4 Load-Fixtures**
(3 Mio. Exposures, 90 k Orders, **1,3 GB**), einer davon (`loadtest-20260922203649`) ist ein Fehlversuch mit nur
Shop- und Experiment-Zeile. Anschauen:

```
psql sh_ab_dev -c "SELECT s.domain, (SELECT COUNT(*) FROM \"Exposure\" e WHERE e.\"shopId\" = s.id) FROM \"Shop\" s WHERE s.domain LIKE 'loadtest-%'"
```

Löschen habe ich bewusst nicht angefasst (CLAUDE.md).

## Offen
- Retention für `SnippetError` und `Exposure` in `/jobs/cleanup` (WP6); Cron für `/jobs/daily-stats` ebenfalls WP6.
- Lasttest auf Render nach dem DB-Upgrade vor WP7 wiederholen.
- Item h (Lighthouse) und die `test = false`-Order weiter offen – nur auf einem echten Store möglich (WP7).
- Secret-Rotation bei der Proxy-Signatur (ADR-0031).
- Review-Risiko non-embedded Dashboard (ADR-0099 c/g); Pseudonymisierung bei `shop/redact` (plan 8.6); PCD-Antrag vor WP-R.
- Prod-DB (Render) vor WP7 sauber neu aufsetzen; `Shop.appClientId` prüfen, falls Dev und Prod je in einer DB landen.
