# ADR-0037: Results-Overview reduziert – Zahlen zuerst, Verdict als schmale Zeile

Datum: 2026-09-27 · Status: entschieden · konkretisiert WP5b, ändert keinen Vertrag

## Kontext
Die Results-Spec in WP5b (plan v4.1) entstand am Schreibtisch, bevor es einen Entwurf gab. Das Design-Review am
25.–27.09. hat sie am gezeichneten Bildschirm geprüft (Figma:
`Results / a-running-no-verdict / dark / lab-slate · v3`, Page „Results Small") und an mehreren Stellen widerlegt.
Parallel ist `docs/DESIGN.md` §10 „Content-Regeln" entstanden: so wenig Content wie möglich, so viel wie nötig,
laientauglich.

Drei Annahmen aus WP5b haben sich als falsch herausgestellt:

1. **„Verdict zuerst".** Vor erreichter Stopp-Regel gibt es kein Urteil – eine große Verdict-Karte, die nur sagt
   „noch nicht", ist der prominenteste Platz der Seite für die geringste Information.
2. **„Primärmetrik auf Overview, alle Goals im Goals-Tab" ("eine Quelle, nicht zwei").** Das war als
   Redundanzvermeidung gedacht, zwingt den Leser aber für die naheliegendste Frage („wie stehen die Zahlen?") in
   einen zweiten Tab. Die Doppelpflege lässt sich billiger über eine gemeinsame Komponente lösen.
3. **Auto-Refresh alle 60 s.** Zahlen, die sich unter dem Cursor ändern, während man sie liest, sind kein Feature.

## Entscheidung

**Reihenfolge auf Overview:** Performance-Tabelle → schmale Verdict-Statuszeile → Distribution und Hypothesis/Setup →
Checks (mit Tainted Days) und History. Zahlen zuerst, dann Kontext, dann Prüfungen.

**Eine Gesamttabelle auf Overview** mit allen Goals: Variant · Visitors · Orders · Conversions · Conv. rate ★ ·
Rev./visitor · AOV · Revenue. Die Primärmetrik ist über Schriftgröße und eine leicht hinterlegte Spalte hervorgehoben.
Der Lift steht klein unter dem Wert („+11,6 % vs A"), nicht als eigene Spalte. Die Tabelle scrollt horizontal im
eigenen Container, die erste Spalte bleibt stehen. **Der Goals-Tab behält nur die Charts** – pro Goal die vier Serien
aus 4.9, ohne eigene Variantentabelle.

**Gesperrte Werte bekommen keine Spalte.** Vor erfüllter Stopp-Regel entfällt die CI-Spalte ganz; danach steht das CI
klein unter dem Lift. Der p-Wert bleibt der Primärmetrik vorbehalten (4.8). **Lifts sind vor erfüllter Stopp-Regel
neutral grau, nie grün oder rot** – Farbe ist eine Wertung, und gewertet wird erst am Ende.

**Verdict vor erfüllter Regel ist eine schmale Statuszeile**, direkt unter der Tabelle: Status, Fortschritt,
prognostiziertes Datum, rechts der Hinweis, was sich wann freischaltet. Die Planwerte (Baseline, MDE, α, Power) und
die Begründung wandern in den Tooltip. Der **Fortschritt bezieht sich auf den kleineren Arm**. Nach erfüllter Regel
wird daraus die volle Verdict-Karte (noch nicht designt).

**Header:** Experiment-Key raus (steht als Zeile „Key" im Setup), Shop-Domain raus (steht im Breadcrumb),
**Edit**-Button dazu. `Start` erscheint nur bei `DRAFT` und `PAUSED`; bei `RUNNING` nur `Pause` und `Stop`. Keine
Scope-Note, kein Filter-Hinweis.

**Laden ohne Polling:** beim Öffnen laden, bei Rückkehr in den Tab neu laden, Refresh-Button mit „Updated n s ago".

**Tooltips stark reduziert** nach DESIGN.md §10 – nur, wo ein Laie stolpert, einer pro Begriff an der ersten Stelle,
Texte weiter aus dem Glossar. Ja: Not yet conclusive / Stopp-Regel · SRM · Guardrail · Tainted days · Key · Salt ·
Visitor type · Channel · Conversions vs. Orders · Daily vs. Cumulative · „Exploratory view – no verdict". Nein:
Spaltenköpfe, Primary metric, Device-Werte, Bot traffic, Code edits, Legendenzeilen. Die AOV-Warnung aus 4.8 bleibt,
wenn AOV die Primärmetrik ist – die verlangt der Vertrag.

**Keine Fußnoten und Erklärzeilen.** Einzige Ausnahme: der Channels-Hinweis „weicht von Shopify Analytics ab"
(Vertrag 4.10, CLAUDE.md) bleibt sichtbar unter der Channels-Tabelle. Ein Vertrag schlägt eine Content-Regel; §10
sieht diesen Fall ausdrücklich vor.

**Distribution:** Im Device-Donut **keine `unknown`-Zeile** – Visitors sind nie unknown, das gibt es nur bei Orders
(4.10). In der Devices-Tabelle bleibt `unknown` als vierter Bucket. Der Channel-Donut zeigt die Top 4 plus
„Other · n groups"; die vollständige Liste steht im Channels-Tab. Keine Erklärzeilen unter den Donuts. Sichtbar ist
Prozent **oder** absolute Zahl, nicht beides.

**Checks:** Der Tainted-Days-Editor (Datums-Chips, „+ Add day") steckt in der Checks-Liste statt in einem eigenen
Block. Keine Sparklines in Tabellen; auf Overview gibt es außer den Donuts keine Charts.

## Alternativen
- **WP5b unverändert lassen** – hieße, eine ungeprüfte Schreibtisch-Spec gegen einen geprüften Entwurf zu
  verteidigen. Die Punkte des Reviews sind einzeln begründet und keiner berührt einen Vertrag.
- **Goals-Tab ganz streichen**, da die Tabelle auf Overview steht – die vier Charts je Goal (4.9) brauchen Platz, den
  Overview nicht hat. Der Tab bleibt, nur ohne Tabelle.
- **Auto-Refresh behalten** – widerspricht §10 und macht die Seite beim Lesen unruhig. Der Refresh-Button erfüllt
  denselben Zweck.

## Konsequenzen
- WP5b wird entsprechend umgeschrieben. Kein Vertrag ändert sich: 4.8 (Urteil nur Primärmetrik), 4.9 (Charts), 4.10
  (Segmente), ADR-0034 (Explore) und ADR-0036 (Stopp-Regel) gelten unverändert.
- Das Abnahme-Item „Testbestellung erscheint innerhalb von 60 s in Results, ohne Cron" wird zu „… nach Refresh oder
  Tab-Fokus, ohne Cron".
- Die Gesamttabelle auf Overview und die Tabellen der Segment-Tabs sind **dieselbe Komponente** mit anderer
  Zeilendimension. Sonst entsteht genau die Doppelpflege, die „eine Quelle, nicht zwei" vermeiden wollte.
- **Offener Konflikt, der zuerst geklärt werden muss:** Die gezeichnete Statuszeile zeigt „40 % of 12.000 visitors per
  arm". Das ist die alte, visitor-basierte `plannedSampleSize`. Seit ADR-0036 ist die Stopp-Regel dreiteilig
  (Conversions pro Arm · Mindestlaufzeit · volle Wochen). Die Zeile muss den Status **aller drei** Bedingungen und
  `evaluableOn` zeigen. Das Design ist an dieser Stelle nachzuziehen, nicht die Regel.
- Noch nicht designt: die volle Verdict-Karte nach erfüllter Regel, die Leer- und „too few"-Zustände.
- `DESIGN.md` fehlen zwei Rezepte, die der Entwurf voraussetzt: ein **Donut** (§1 erlaubt ihn, ein Rezept gibt es
  nicht) und ein **gestyltes Tooltip-Popover** (das beschriebene native `title` lässt sich nicht stylen und
  funktioniert auf Touch nicht). Beides gehört nach DESIGN.md, bevor 5b gebaut wird.
- Verweise auf DESIGN.md erfolgen ab jetzt **über Abschnittsnamen, nie über Zeilennummern** – die bisherigen
  „§390/§433/§506/§533/§543/§16" waren Zeilennummern und sind durch §10 verrutscht.
