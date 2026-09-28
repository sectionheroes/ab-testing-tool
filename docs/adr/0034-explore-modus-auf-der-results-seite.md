# ADR-0034: Datums-Range und Device-Filter auf der Results-Seite nur als „Explore", nie mit Urteil

Datum: 2026-09-23 · Status: entschieden

## Kontext
Die Results-Seite soll nach Device filterbar sein und einen Datums-Range-Picker bekommen (Joel, 23.09.). Beides
kollidiert mit der Statistik-Grundlage aus ADR-0018 (fester Horizont) und Vertrag 4.8.

Der z-Test ist auf 5 % Fehlerrate nur kalibriert, wenn **einmal**, am geplanten Ende, ausgewertet wird. Jede
zusätzliche Auswertungsfreiheit multipliziert die Zahl der impliziten Tests: ein freier Datums-Range erlaubt es, in
praktisch jedem A/A-Test ein Fenster zu finden, in dem B „gewinnt"; drei Device-Segmente sind drei zusätzliche
Vergleiche. Ohne Regel wird die Fixed-Horizon-Logik über die UI wieder ausgehebelt.

Dazu kommen zwei technische Randbedingungen:

- Das Attributionsfenster läuft von `Exposure.firstSeenAt` bis `Experiment.endedAt` (4.8). Ein Filter auf
  Expositions-Tage schneidet Orders ab, die danach eingingen – die Zahlen im gefilterten Fenster sind also nicht
  „dieselbe Auswertung, nur kürzer".
- Für `ENDED`-Experimente liest die Results-Seite ausschließlich den eingefrorenen `ExperimentResult`-Snapshot
  (ADR-0025), und der hat genau ein Fenster.

## Entscheidung
Datums-Range und Device-Filter existieren, sind aber als **Explore-Modus** gekennzeichnet und vom Urteil getrennt:

- Sie verändern ausschließlich die **Charts und die Rohzahlen** (Visitors, Conversions, Orders, Revenue und die daraus
  abgeleiteten Raten).
- Sie verändern **nie**: p-Wert, Konfidenzintervall, `significant`, Winner, Sample-Size-Fortschritt, SRM-Badge.
  Solange ein Filter aktiv ist, sind diese Felder ausgeblendet – nicht ausgegraut, nicht „vorläufig", sondern weg –
  mit dem Hinweis „Exploratory view – no verdict".
- Der Verdict-Block zeigt immer das **ungefilterte** Ergebnis über das volle Fenster.
- Bei `ENDED` ist der Explore-Modus deaktiviert; die Seite rendert den Snapshot.
- Die Device-Aufteilung bleibt zusätzlich als aufklappbare Zeilen sichtbar (WP5), ebenfalls ohne p-Werte.

## Alternativen
- **Kein Filter** – statistisch am saubersten, nimmt aber eine Diagnose-Fähigkeit weg, die im Alltag wirklich
  gebraucht wird (Mobile/Desktop-Umkehrungen, Tage mit kaputtem Tracking).
- **Filter mit voller Statistik plus Mehrfachvergleichs-Korrektur** – Bonferroni über Segmente wäre formal möglich,
  aber die Fenster sind nach dem Ansehen gewählt („post hoc"); keine Korrektur repariert das. Vortäuschung von
  Strenge.
- **Filter nur nach Testende** – ändert nichts am Problem, weil die Auswahl weiterhin datengetrieben erfolgt.

## Konsequenzen
- Segmente sind im Tool ausdrücklich **Hypothesen-Generatoren**, keine Entscheidungen. Wer Mobile separat entscheiden
  will, setzt einen eigenen Test mit Device-Targeting auf – das kann das Tool seit WP3.
- Die Results-Seite braucht zwei klar getrennte Bereiche: Verdict (ungefiltert, fix) und Explore (gefiltert). Das ist
  eine Vorgabe an das UI, keine Freiheit.
- Der Explore-Modus liest immer live, nie aus `DailyStat` – dieselbe Query wie die Hauptzahlen, nur mit zusätzlicher
  `WHERE`-Bedingung (ADR-0019).
- „Certainty über Zeit" (ein Chart, den ABLyft anbietet) entfällt aus demselben Grund. Ersatz ist die
  Sample-Size-Fortschrittslinie. Dokumentiert in Vertrag 4.9.
