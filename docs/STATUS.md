# Status
Stand: 2026-09-28

## Aktuell
WP: **WP4.1 vollständig abgenommen und gemerged** (PR #5, `d032124`). Snippet `sh-ab-dev-7` ist auf der Dev-App
released, die Dev-Store-Abnahme (Zeile n) ist durch. **Nächste Session: WP5a** (Shops, Users, Experiments-Liste,
Editor, Glossar) – hängt an keinem offenen Punkt.

Inhalt: `_ab_v` im Snippet (4.1b), iPadOS-Device-Heuristik, `n`/`isNewVisitor` (ADR-0035), `_ab_v`-Ingest nach
`OrderAttribution.visitorId`, Aggregation mit echtem Visitor-Join und `unknown` als viertem Device-Bucket (ADR-0033),
`classifyChannel` (4.10), generische `breakdown(experiment, dimension, opts)`, Stopp-Regel nach ADR-0036 statt
`plannedSampleSize` samt `setStoppingRule` mit der Verschärfen-nur-Sperre (4.6), Rechner beidseitig,
`STATS_VERSION` 2.0.0.

Der PR hat außerdem die vier nie gepushten Docs-Commits nach `main` gebracht – plan.md v4.3, ADR-0033–0037,
DESIGN.md und die aktuelle CLAUDE.md. **`main` ist damit wieder vollständig** (geprüft: ADRs bis 0037, plan.md v4.3).

## Abnahme WP4.1
| # | Item | Ergebnis |
|---|---|---|
| a | Zwei Orders desselben Gast-Visitors → `converters` +1, `orders` +2 | **pass** – DB-Test; ohne `_ab_v` steigt `converters` weiter um 2, der alte Bias ist als Gegenprobe mitgetestet |
| b | Order ohne `_ab_v` → Fallback greift, Bucket `unknown` | **pass** – DB-Test, ADR-0032-Pfad komplett erhalten inkl. seiner Tests |
| c | Summe über alle vier Device-Buckets = Gesamtwert | **pass** – DB-Test für Visitors, Conversions, Orders und Revenue, beide Arme |
| d | Tages-Aggregation summiert sich, tainted Tag fehlt in der Reihe | **pass** – DB-Test; der Tag fehlt auch auf der Tagesachse |
| e | `breakdown()` summiert sich für **jede** Dimension auf `evaluate()` | **pass** – DB-Test je Dimension, mit und ohne Tag, inkl. `unknown`/`unassigned` |
| f | `classifyChannel` trifft alle zehn Gruppen, ohne Referrer/UTM `direct` | **pass** – 70 tabellengetriebene Tests inkl. aller Reihenfolge-Fälle |
| g | Stopp-Regel: 1.000 Conversions bei 8 Tagen → `met: false`, `evaluableOn` Tag 14; alle drei null → nie signifikant; Mittwochs-Start → Tag 7/14/21 | **pass** – 25 Tests, DST und Shop-Zeitzone mitgeprüft |
| h | Rechner: MDE 12,5 % ↔ 1.000 Conversions auf ±2 % | **pass** – 0,23 % Abstand; der ~2,7-%-Abstand zur exakten Fleiss-n ist separat festgenagelt |
| i | `isNewVisitor` true/false/true nach Cookie- und localStorage-Löschung | **pass** – Unit-Tests gegen jsdom; **end-to-end offen** (Dev Store) |
| j | Device-Heuristik iPad | **pass** – 16 Referenztests gegen echte UA-Strings; iPad im Desktop-Modus und Mac Safari sind byteweise identisch und werden nur über `maxTouchPoints` getrennt |
| k | `pnpm test`, `pnpm test:db`, typecheck, lint grün | **pass** – 465 Unit-Tests, 73 DB-Tests; A/A **4,98 %** (CR) / **5,36 %** (RPV) |
| l | Snippet-Budget | **pass** – **3.647 B gzip** von 8.192 (45 %), +142 B gegenüber WP3 |
| m | Lasttest < 500 ms je Dimension | **pass bei realistischem Volumen, fail bei 1 Mio.** – siehe unten |
| n | Testbestellung als Gast im Dev Store, „Buy Now" ohne Cart-Kontakt, `_ab_v` nicht in der Bestellbestätigung | **pass** (28.09., `sh-ab-testing-one`) – Order **#1008** über Cart: `_ab` und `_ab_v` als **Order-Attribut und** Line-Item-Property, Variante b. Order **#1009** über „Buy it now": nur **Line-Item-Property**, keine „Additional details"-Karte – kein Cart-Kontakt, also kein `/cart/update.js`, genau wie 4.1b es vorsieht. Zwei private Fenster → zwei verschiedene `_ab_v` und zwei verschiedene Varianten (a/b), Bucketing splittet. `_ab_v` **in keiner** Bestätigungsmail und **nicht** auf der Order-Status-Seite |

## Lasttest
`pnpm seed:load`, danach zweimal `VACUUM`, gemessen mit dem neuen `pnpm measure:load`. Medianwerte, lokales
Postgres 17 auf dem Laptop, **2,15 Mio. Exposure-Zeilen in der Tabelle** (drei Fixtures, 1.086 MB).

| | realistisch (150 k / 4,5 k) | Stress (1 Mio. / 30 k) |
|---|---|---|
| `evaluate()` | **121 ms** | 547 ms |
| `breakdown("day")` | **150 ms** | 665 ms |
| `breakdown("device")` | **124 ms** | 587–862 ms |
| `breakdown("visitorType")` | **120 ms** | 580 ms |
| `breakdown("channel")` | **174 ms** | 986 ms |
| `device × day` | **149 ms** | 711 ms |
| `visitorType × day` | **160 ms** | 713 ms |
| `channel × day` | **205 ms** | 1.124 ms |

**Realistisches Volumen liegt mit Faktor 2,4–4 unter dem Ziel.** 150 k Exposures sind mehr, als ein 14-Tage-Test auf
dem größten Shop erzeugt (rahmen §1: 8.000 Sessions/Tag → ~112 k).

**Die 1-Mio.-Zahl verfehlt das Ziel und ist nicht mit WP4s 396 ms vergleichbar.** WP4s Fixture hatte `referrer` und
`utm` leer; die Channel-Dimension hätte dann nichts zu gruppieren. Mit beiden gefüllt ist die Zeile 239 statt ~100 Byte
breit, und der Hash-Seiten-Scan über 980.000 Exposures für den Order-Join kostet entsprechend. 1 Mio. Exposures in
*einem* Experiment sind rund das 90-Tage-Maximum des größten Shops.

**Vier gemessene Verbesserungen sind drin** (jede einzeln per EXPLAIN belegt, Details im Commit):
zweites `VACUUM` (27.162 → 31 Heap Fetches, Exposure-Aggregation 120 → 78 ms) · `LATERAL … LIMIT 1` gegen einen
UNIQUE-Index durch einen einfachen `LEFT JOIN` ersetzt (447–633 → 407–510 ms) · Customer-Lateral hinter
`co.visitor_id IS NULL` · Tages-Intervall-Join nur noch für index-only-Dimensionen, für `channel` die Per-Zeilen-Datums-
Gruppierung (`channel × day` 1.404 → 205 ms). Die vier Regeln stehen jetzt in CLAUDE.md.

**Offene Entscheidung für Joel, falls die 1-Mio.-Zahl unter 500 ms muss:** ein deckender Index
`(experimentId, variantId, device, isBot, firstSeenAt, visitorId)` macht den Order-Join index-only. Gemessen: **40 ms
schneller für 238 MB zusätzlichen Index bei 2 Mio. Zeilen.** Meine Empfehlung ist **nein** – Storage ist auf Render der
einzige wachsende Posten und lässt sich nicht zurückdrehen (rahmen §4), und das realistische Volumen ist längst grün.
Der Test-Index ist wieder gelöscht.

## Befunde
- **Vier Docs-Commits waren nie gepusht.** Der Squash-Merge von PR #4 hat nur den WP4-Code genommen; plan.md v4.3,
  ADR-0033–0037, DESIGN.md und die neue CLAUDE.md fehlten auf `main`. Lokal auf `wp4-stats` noch vorhanden, per
  Cherry-Pick auf diesen Branch geholt. **Sie landen über den WP4.1-PR auf `main`.**
- **`_ab_v`-Sichtbarkeit: praktisch geklärt, dokumentarisch weiter dünn.** Die Doku belegt die Unterstrich-Regel nur
  für **Line Item Properties**; für **Cart Attributes** nennt sie den doppelten Unterstrich, der über die Ajax API
  nicht lesbar und damit für uns unbrauchbar ist. Der Praxistest am 28.09. (Zeile n) zeigt: `_ab_v` taucht **weder in
  der Bestätigungsmail noch auf der Order-Status-Seite** auf – auf keinem der beiden Pfade. ADR-0033 braucht damit
  keinen Nachfolger. Die Aussage stützt sich aber auf **eine Messung mit einem Standard-Theme**, nicht auf die Doku;
  bei einem stark umgebauten Kunden-Theme vor dem Livegang erneut prüfen (WP7).
- **Die Attribution deckt nicht jedes Storefront-Setup ab** (aus der Analyse zu Zeile n). Die zwei Pfade versagen an
  verschiedenen Stellen: das **Cart-Attribut** übersteht das Zusammenführen von Line Items (Bundle-Apps,
  `cartTransform`), fehlt aber bei „Buy Now" ohne Cart-Kontakt; die **Line-Item-Property** deckt Buy Now ab, kann aber
  bei Bundle-Apps und bei Ajax-Cart-Apps verlorengehen, die ihr Add-to-Cart-Payload von Hand bauen statt `FormData` zu
  nehmen. **Headless-Storefronts (Hydrogen) sind gar nicht abgedeckt** – eine Theme App Extension existiert dort nicht;
  das ist eine Onboarding-Voraussetzung, keine Lücke. Fällt beides aus, greift der ADR-0032-Fallback und die Order
  landet in `unknown` – ungenauer gezählt, nicht verloren. **Der sichtbare `unknown`-Bucket ist dafür das
  Messinstrument**; 86 % Device-Link-Rate gelten für ein Standard-Theme ohne Drittanbieter-Apps. Vor WP7 gezielt gegen
  die Apps testen, die unsere Kunden tatsächlich einsetzen (Bundles, Upsell, Sticky-ATC).
- **Die Device-Link-Rate springt von 31 % auf 86 %** – genau das, wofür ADR-0033 gebaut wurde.
- **Die Load-Fixture war zu pessimistisch und ist korrigiert.** Sie gab jeder Zeile einen eindeutigen Referrer-Pfad,
  also 1 Mio. verschiedene Gruppenschlüssel und eine doppelt so breite Tabelle. Echte `document.referrer`-Werte fallen
  auf wenige Hosts zusammen. Jetzt 30 % ohne Referrer, 30 % mit UTM, einer mit Pfad.
- `timezone.ts` liegt jetzt in `lib/stats/`, weil `evaluate()` dieselbe Kalendertags-Arithmetik für die Stopp-Regel
  braucht und `lib/` nicht aus `app/` importieren darf. `app/services/timezone.ts` re-exportiert nur noch.
- **`setStoppingRule` ist Mehrarbeit gegenüber der WP4.1-Liste**, bewusst: ADR-0036 verlangt die Verschärfen-nur-Sperre,
  und ohne sie könnte WP5a die Regel unter den aktuellen Stand setzen und sich einen p-Wert freischalten.

## Lokale DB
Drei Load-Fixtures (2,15 Mio. Exposures, 1.086 MB) plus die zwei Dev-Store-Shops. `pnpm seed:load` löscht nie etwas;
Aufräumen ist bewusst nicht angefasst (CLAUDE.md). Anschauen:

```
psql sh_ab_dev -c "SELECT s.domain, (SELECT COUNT(*) FROM \"Exposure\" e WHERE e.\"shopId\" = s.id) FROM \"Shop\" s WHERE s.domain LIKE 'loadtest-%'"
```

## Offen
- Entscheidung, ob die 1-Mio.-Zahl unter 500 ms muss – **Empfehlung: nein** (kein deckender Index). Die eigentliche
  Dimensionierungsfrage ist Render mit 0,1 CPU, nicht der Index; die Messung dort ist die Entscheidung.
- Retention für `SnippetError` und `Exposure` in `/jobs/cleanup` (WP6); Cron für `/jobs/daily-stats` ebenfalls WP6.
- Lasttest auf Render nach dem DB-Upgrade vor WP7 wiederholen – dort 0,1 CPU, die Zahlen oben sind Laptop-Zahlen.
- Item h (Lighthouse) und die `test = false`-Order nur auf einem echten Store möglich (WP7).
- Secret-Rotation bei der Proxy-Signatur (ADR-0031); Review-Risiko non-embedded Dashboard (ADR-0099 c/g);
  Pseudonymisierung bei `shop/redact` (plan 8.6); PCD-Antrag vor WP-R.
- Prod-DB (Render) vor WP7 sauber neu aufsetzen.
- **WP5b-Blocker** (plan.md v4.3): Designsystem ist entschieden, offen bleiben das **Donut-Rezept** und ein
  **gestyltes Tooltip-Popover** in DESIGN.md, die volle Verdict-Karte, die Leer-/„too few"-Zustände und die Figma-
  Statuszeile, die noch die abgelöste visitor-basierte Sample Size zeigt statt der Stopp-Regel (ADR-0036).
- **WP-R**: Distribution Method auf `sh-ab` prüfen (Public, irreversibel) → PCD-Antrag Level 1 + `read_all_orders`
  → Listing (Icon, Screenshots, Privacy Policy, Support-Mail, Emergency Contact, Screencast). PCD wird **durch** das
  App Review freigegeben, das Listing liegt damit auf dem kritischen Pfad. App Store visibility vor dem Einreichen auf
  „Limit visibility" setzen – freigegebene Listings stehen sonst standardmäßig sichtbar im Store.
