# ADR-0036: Stopp-Regel aus drei Bedingungen statt einer einzelnen `plannedSampleSize`

Datum: 2026-09-27 · Status: entschieden · konkretisiert ADR-0018 (fester Horizont), ersetzt es nicht

## Kontext
ADR-0018 hat den festen Horizont festgelegt: ein Urteil gibt es erst, wenn die geplante Datenmenge erreicht ist
(`significant = sampleSizeReached && p < α`). Umgesetzt ist das als **ein** Feld `Experiment.plannedSampleSize`
(Visitors pro Variante, nullable). Drei Probleme daran:

1. **Die Einheit passt nicht zur Praxis.** Sectionheroes hat bisher nie nach Visitors entschieden, sondern nach
   **≥ 1.000 Conversions pro Arm** und **nur auf vollen Wochengrenzen** (7, 14, 21 Tage). Beides ist statistisch
   sinnvoll und in der Visitor-Zahl nicht ausdrückbar.
2. **Visitors sind shop-abhängig, Conversions nicht.** Der erkennbare relative Effekt hängt bei Conversion Rates fast
   nur an der Zahl der Conversions: relativer Standardfehler ≈ `√(1/C)`, also MDE ≈ `2{,}8·√(2/C)`. 1.000 Conversions
   pro Arm entsprechen ~12,5 % relativem MDE, unabhängig davon, ob die Shop-CR bei 1 % oder 5 % liegt. Eine
   Visitor-Zahl muss dagegen pro Shop aus einer Baseline-CR gerechnet werden – und die kennen wir nicht, weil wir nur
   Besucher laufender Experimente sehen, nicht den Gesamttraffic.
3. **Wochenzyklen kennt die Formel nicht.** Die Sample-Size-Formel ist es egal, wie n über die Woche verteilt ist. Im
   E-Commerce ist es das nicht: wer nach 12 Tagen stoppt, gewichtet fünf Wochentage doppelt.

Recherche zum Branchenstand (27.09.2026), Quellen unten:

- **Laufzeit** – Konsens. Kohavi: mindestens ein bis zwei Wochen, immer den vollen Wochenzyklus. Convert: Minimum zwei
  Wochen unabhängig von der Signifikanz, Dauer vorher festlegen. SplitBase (CRO-Agentur für 8–9-stellige
  Shopify-DTC-Brands): drei bis vier volle Wochen und mindestens zwei Business-Zyklen, „auch wenn die Sample Size
  früher erreicht ist".
- **Conversions pro Variante** – die Branche ist auffällig lax: 100 als verbreitetes Minimum (Convert, SplitBase,
  Growth Rock), 200–400 bei CXL und Growth Rock als „was viele CRO-Blogs sagen", 250–350 bei einzelnen Praktikern.
  Growth Rock belegt mit einem eigenen **A/A-Test**, dass bei 65–89 Conversions pro Variante 95 % Signifikanz
  auftreten kann, obwohl beide Varianten identisch sind. Die 100er-Empfehlung entspricht ~40 % MDE und produziert
  damit vor allem Scheingewinner.
- **Abbruch nach oben** – SplitBase: nach 4 Wochen ohne erreichte Menge abbrechen, der MDE war für den Traffic zu
  klein. Convert: früh stoppen nur bei Schaden, Futility (bedingte Power < 20 %) oder Integritätsproblem, nie wegen
  eines positiven Zwischenstands.

Die bestehende Praxis liegt damit am **strengen** Ende und bleibt erhalten. Ihr fehlen genau zwei Dinge: eine
Mindestlaufzeit unabhängig von den Conversions und ein Abbruchkriterium nach oben.

## Entscheidung
`Experiment.plannedSampleSize` wird durch eine **Stopp-Regel aus drei Bedingungen** ersetzt. Ein Experiment ist
auswertbar (`stoppingRuleMet`), wenn **alle gesetzten** Bedingungen erfüllt sind:

| Bedingung | Default | Bedeutung |
|---|---|---|
| `minConversionsPerArm` | 1.000 | konvertierende Visitors je Arm (4.8) |
| `minDurationDays` | 14 | Kalendertage seit `startedAt` in `Shop.timezone` |
| `requireFullWeeks` | true | nur auf Vielfachen von 7 Tagen **ab dem Startdatum** |

- **Die Wochengrenze hängt am Startdatum**, nicht am Montag. Start an einem Mittwoch ⇒ Grenzen an Tag 7, 14, 21. Nur
  so ist jeder Zyklus ein vollständiger Wochentagszyklus; Kalenderwochen hätten eine angebrochene erste Woche.
- Jede Bedingung kann einzeln abgeschaltet werden (null). Sind **alle** null, bleibt `significant` false – wie bisher
  bei fehlender `plannedSampleSize`.
- Die harte Kopplung bleibt unverändert: `significant = stoppingRuleMet && pValue < alphaAdjusted`.
- `evaluate()` liefert statt eines Booleans den **Status je Bedingung** plus `evaluableOn` – das späteste der drei
  Enddaten, bei den Conversions aus dem bisherigen Tempo hochgerechnet.
- **Futility**: Liegt `evaluableOn` mehr als 6 Wochen nach `startedAt`, setzt `evaluate()` eine Warnung. Kein
  Auto-Stop (wie beim Guardrail, ADR-0018/WP4), nur ein Hinweis.
- **Verschärfen ja, lockern nein** (Ergänzung zu Vertrag 4.6): Bei `RUNNING` darf die Regel nur strenger werden –
  mehr Conversions, mehr Tage, volle Wochen einschalten. Lockern nur in `DRAFT`/`PAUSED`. Jede Änderung erzeugt einen
  AuditLog-Eintrag und einen Marker im Report. Ohne diese Sperre könnte man die Schwelle unter den aktuellen Stand
  setzen und sich so einen p-Wert freischalten – die Hintertür, die die ganze Fixed-Horizon-Logik aushebelt.

Der Sample-Size-Rechner übersetzt weiterhin in beide Richtungen: MDE eingeben → Conversions und Visitors sehen, oder
Conversions eingeben → den implizierten MDE sehen. Für **RPV** wird der MDE getrennt ausgewiesen, weil die
Umsatzverteilung stärker streut: 1.000 Conversions pro Arm reichen dort eher für 20–25 % als für 12,5 %.

## Alternativen
- **Alles beim Alten (`plannedSampleSize` in Visitors)** – bildet die tatsächliche Arbeitsweise nicht ab und braucht
  eine Baseline-CR, die wir nicht haben.
- **Nur Conversions, keine Mindestlaufzeit** – auf traffic-starken Shops wären 1.000 Conversions pro Arm nach vier
  Tagen erreicht; die Auswertung liefe dann über einen unvollständigen Wochenzyklus, also genau den Fehler, den die
  Wochenregel vermeidet.
- **Nur Laufzeit, keine Conversion-Schwelle** – vier Wochen auf einem kleinen Shop können 80 Conversions pro Arm sein.
  Growth Rocks A/A-Befund zeigt, was dabei herauskommt.
- **Sequenzielles Testen** (Alpha-Spending, always-valid p-values) – erlaubt legales frühes Stoppen, kostet 15–25 %
  mehr Traffic für dieselbe Power und ist eine ganz andere Statistik-Engine. Bleibt Phase 2.
- **Auto-Stop bei erfüllter Regel** – widerspricht ADR-0018s Grundhaltung (das Tool urteilt nicht selbst) und würde
  Tests beenden, während jemand noch eine Woche dranhängen möchte.

## Konsequenzen
- Migration: `plannedSampleSize` entfällt zugunsten von `minConversionsPerArm`, `minDurationDays`, `requireFullWeeks`.
  Kein Backfill nötig, das Tool ist nicht live.
- `ExperimentResult.snapshot` friert die Regel mit ein (sie gehört zum `frozen`-Teil), damit später nachvollziehbar
  ist, wogegen gemessen wurde. `STATS_VERSION` wird erhöht.
- Die Results-Seite zeigt die drei Bedingungen einzeln mit Status und das prognostizierte `evaluableOn`, statt eines
  einzelnen Fortschrittsbalkens. Vorgabe an WP5b, keine Freiheit.
- Der Stop-Dialog warnt, wenn die Regel nicht erfüllt ist: das Ergebnis wird ohne Urteil eingefroren, endgültig, weil
  es keinen Recompute gibt (ADR-0025). Abbrechen bleibt trotzdem jederzeit möglich (`ABORTED` / `INVALID`).
- Die Unterscheidung **Pause** (Auslieferung stoppen, Ergebnis offen) und **Stop** (einfrieren) muss im UI erklärt
  werden. Bisher steht sie nirgends, und es ist ein Fehler, den man genau einmal macht.
- Die Prognose beim Anlegen („bei aktuellem Tempo X Wochen") braucht das Conversion-Tempo des Shops. Für den ersten
  Test eines Shops gibt es das nicht – dann bleibt das Feld leer statt zu raten.

## Quellen
- SplitBase, *Shopify A/B Testing for 8 and 9 Figure DTC Brands* – https://splitbase.com/blog/shopify-ab-testing
- Convert, *A Comprehensive Guide To Test Duration* – https://www.convert.com/blog/a-b-testing/how-long-to-run-ab-test/
- Growth Rock, *The Three (or Four) Safeguards to Stopping an AB Test* – https://growthrock.co/stop-ab-test/
- CXL, *Stopping A/B Tests: How Many Conversions Do I Need?* – https://cxl.com/blog/stopping-ab-tests-how-many-conversions-do-i-need/
- Kohavi, Tang, Xu, *Trustworthy Online Controlled Experiments*, Cambridge University Press
