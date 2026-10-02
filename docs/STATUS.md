# Status
Stand: 2026-10-02

## Aktuell
**WP5a ist durch**, Branch `wp5a-dashboard`, PR gegen `main`: Navigation nach ADR-0038, Experiments-Liste,
Experiment-Formular, Experiment-Detailseite, Shops, Users, Reconciliation, Glossar. Abnahme komplett pass, Belege in
`docs/screenshots/wp5a/`. Diese Session hat nichts an den Seiten geändert, sondern **nachgezogen**:

**1. Die Design-Korrekturen vom 01.10. abends sind im Code** (`643f8f7`, ein Commit, weil `app/design-system.test.ts`
`app/app.css` und den CSS-Block in DESIGN.md §2 byte-gleich hält): die Tokens `scrim` und `control-checked`/-content
stehen jetzt im CSS statt nur in der Tabelle · Input, Select und Textarea liegen vertieft auf `bg-base-100` (auf einer
`base-200`-Card verschwand das Feld bis auf den Rand), Höhe 40 px (`md`) bzw. 32 px (`sm`) · gesetzte Checkbox und
gesetztes Radio auf `control-checked` – im Light Mode war Mint auf Weiß als „an" kaum von „aus" zu unterscheiden ·
MobileTopBar wie Figma 8:249: Wortmarke links, Menü rechts, kein Seitentitel (`Wordmark` ist dafür aus `Shell.tsx`
exportiert) · Styleguide-Notizen nachgezogen. 512 Unit-Tests, typecheck und lint grün, Styleguide in beiden Themes
gesichtet.

**2. plan.md ist auf v4.4.** §5a beschreibt den gebauten Stand statt des Entwurfs von v4.3 (Shop in der URL,
Status-Tabs statt Filter-Chips, Spalten Conversions + Result, Rechner einwegs, Stopp-Regel-Karte mit zwei Eingaben,
keine Goals-Karte, kein QA-Bereich im DRAFT, Start auf der Detailseite). §5b hat die vier Blocker von v4.3 als
erledigt, die sieben Overview-Zustände, das Modal-/Donut-/Tooltip-Rezept und die zwei Entscheidungen von unten.
**Kein Vertrag in §4 berührt.**

## Entscheidungen dieser Session (Joel, 02.10.)
- **Fortschrittsbalken bleibt neutral grau**, auch in der Experiments-Liste. Figma 2-21 zeichnet ihn emerald und
  stimmt damit nicht mehr – Farbe ist ein Urteil (DESIGN.md §7/§10, ADR-0037).
- **SRM schaltet das Urteil ab, nicht die Zahlen.** Großer Alert über der Performance-Tabelle; die Tabelle bleibt
  **vollständig und ungedimmt** (Figmas „debugging only"-Dimmung wird nicht gebaut); p-Wert, Winner-Badge und
  `significant` verschwinden, solange SRM schlägt, und zwar in der **Service-Schicht**, damit Dashboard, CLI und
  `ExperimentResult` dasselbe sagen. Checks-Liste darunter unverändert. → **braucht ein ADR und einen Test**, in 5b.
- **Charts starten auf Cumulative**, alle vier. Vertrag 4.9 schreibt das nur für Improvement; die Begründung dort
  („Tageswerte sind früh fast nur Rauschen") gilt für alle. Reiner UI-Default, Rechenweg und Semantik unberührt.
- **„too few"-Zustand** (4.10) ist nicht gezeichnet und wird es auch nicht: der Entwickler baut ihn in 5b aus den
  §2-Tokens, wie er es für richtig hält.

## Offen
- **ADR für die SRM-Entscheidung** (siehe oben) – gehört in die 5b-Session, zusammen mit dem Test.
- **Der Stop-Dialog fehlt weiterhin, also kann ein Experiment im UI nicht beendet werden.** Das ist 5b; bis dahin
  geht Stop über die Service-Schicht (`pnpm experiment:status`), ab 5c über die CLI.
- **QA vor dem Start geht mit den aktuellen Verträgen nicht:** Force-Links (4.4) wirken nur auf Experimente im
  Metafield, dort stehen nur `RUNNING` (4.2). Für WP5a weggelassen (Force-Links erst bei `RUNNING`/`PAUSED`).
  Betrifft in 5b die „Before you start"-Checkliste in `g-draft-zero-data`: entweder reiner Haken ohne Link, oder der
  QA-Status wird vorher entschieden (additiver Vertrag).
- **Custom Goals bleiben Phase 2** (plan.md §9, Weg B). Vor der Umsetzung zu klären: (a) Shopify-Events gehen nur über
  eine **App Pixel Extension** (`analytics.subscribe`, per Dev-MCP geprüft) – zweite Extension, review-relevant,
  Sandbox, Visitor-Bindung über `browser.cookie` (`_shab_vid`) noch zu prüfen. (b) Klick/Seitenaufruf/`shab.track`
  kosten Snippet-Budget (8 KB). (c) Neue Tabelle für Goal-Events + Retention 12 Monate wie `Exposure`. (d) Stopp-Regel
  und Rechner für ein Custom Goal als Primary. (e) `ExperimentResult` muss Custom-Goal-Zahlen und -Definition
  einfrieren. Dazu die zweite Modelländerung **„Also measured"** – heute zeigt der Report immer alle drei Metriken.
- **Attributions-Abdeckung vor WP7 prüfen** (Befund aus der WP4.1-Abnahme): Das **Cart-Attribut** übersteht
  Line-Item-Merges (Bundle-Apps, `cartTransform`), fehlt aber bei „Buy Now"; die **Line-Item-Property** deckt Buy Now,
  kann aber bei Bundle- und Ajax-Cart-Apps verlorengehen, die ihr Payload von Hand bauen statt `FormData` zu nehmen.
  **Headless (Hydrogen) ist gar nicht abgedeckt** – Onboarding-Voraussetzung, keine Lücke. Fällt beides aus, greift
  der ADR-0032-Fallback und die Order landet sichtbar in `unknown`. Die **86 % Device-Link-Rate gelten für ein
  Standard-Theme ohne Drittanbieter-Apps**; gezielt gegen die Apps testen, die unsere Kunden einsetzen. Ebenso erneut
  prüfen, dass `_ab_v` auf einem **Kunden-Theme** nicht in der Bestätigungsmail und nicht auf der Order-Status-Seite
  auftaucht.
- Entscheidung Deckungsindex für 1 Mio. Exposures (+238 MB, −40 ms) – Empfehlung: nein.
- WP6: Retention für `SnippetError`/`Exposure` in `/jobs/cleanup`, Cron `/jobs/daily-stats`; Lasttest auf Render vor WP7.
- **Logo:** die Shell zeigt weiter die Text-Wortmarke; die PNGs aus DESIGN.md §4 liegen nicht im Repo.
- WP-R: Distribution Method auf `sh-ab` prüfen (Public, irreversibel) → PCD Level 1 + `read_all_orders` → Listing.
  PCD wird **durch** das App Review freigegeben, das Listing liegt damit auf dem kritischen Pfad. Vor dem Einreichen
  „Limit visibility" setzen.
- Design als Nächstes: Mobile-Liste, Shops-Seite, Edit-Zustand `RUNNING` (4.6). Im Formular die Goals-Karte als
  Phase 2 kennzeichnen (Weg B) und den Drei-Werte-Select für die Primärmetrik zurückzeichnen; in Figma 2-21 den
  Fortschrittsbalken auf neutral ziehen.
