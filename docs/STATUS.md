# Status
Stand: 2026-09-29

## Aktuell
**WP4.1 vollständig abgenommen und gemerged** (PR #5, `d032124`); `main` ist damit wieder vollständig – die vier nie
gepushten Docs-Commits (plan.md v4.3, ADR-0033–0037, DESIGN.md, CLAUDE.md) sind mit drin. Abnahme a–n **pass**
(465 Unit-, 73 DB-Tests, A/A 4,98 % / 5,36 %, Snippet 3.647 B gzip). Lasttest: realistisches Volumen (150 k Exposures)
120–205 ms je Dimension; 1 Mio. verfehlt 500 ms (547–1.124 ms).
Parallel: Design-Session in Figma für WP5a/5b (Lab Dark). **Nächste Dev-Session: WP5a.**

**Abnahme n (28.09., `sh-ab-testing-one`, Snippet `sh-ab-dev-7`):** Order #1008 über Cart – `_ab` und `_ab_v` als
Order-Attribut **und** Line-Item-Property. Order #1009 über „Buy it now" – nur Line-Item-Property, keine
„Additional details"-Karte, weil ohne Cart-Kontakt kein `/cart/update.js` läuft (genau wie 4.1b vorsieht). Zwei private
Fenster → zwei `_ab_v`, zwei Varianten (a/b). `_ab_v` **in keiner Bestätigungsmail und nicht auf der
Order-Status-Seite** → ADR-0033 braucht keinen Nachfolger. Gemessen mit Standard-Theme, nicht aus der Doku belegt –
auf einem Kunden-Theme vor dem Livegang erneut prüfen.

**Befund Attribution-Abdeckung:** Die zwei Pfade versagen unterschiedlich. Das **Cart-Attribut** übersteht
Line-Item-Merges (Bundle-Apps, `cartTransform`), fehlt aber bei „Buy Now"; die **Line-Item-Property** deckt Buy Now,
kann aber bei Bundle- und Ajax-Cart-Apps verlorengehen, die ihr Payload von Hand bauen statt `FormData` zu nehmen.
**Headless (Hydrogen) ist gar nicht abgedeckt** – Onboarding-Voraussetzung, keine Lücke. Fällt beides aus, greift der
ADR-0032-Fallback, die Order landet sichtbar in `unknown`. Die **86 % Device-Link-Rate gelten für ein Standard-Theme
ohne Drittanbieter-Apps**; vor WP7 gezielt gegen die Apps testen, die unsere Kunden einsetzen.

## Design-Entscheidungen (28.09., Figma – noch nicht in plan.md/ADR)
- **Shop-Switcher oben in der Sidebar = Kontext für alle Testing-Seiten** (Experiments, Reconciliation, Results).
  Listet nur `ACTIVE`-Shops plus „All shops". Shop gewählt → Liste ohne Shop-Zeile, „New experiment" legt direkt für
  diesen Shop an. „All shops" → globale Liste mit Shop-Zeile, „New experiment" fragt erst nach dem Shop. Popover endet
  mit „Manage shops →". Vorschlag, nicht entschieden: Shop in der URL (`/dashboard/s/<shop>/…`).
  *Weicht ab von:* plan.md WP5a sagt nur „Experiments pro Shop und global", ohne Ort des Wechsels.
- **Sidebar neu gruppiert:** *Testing* (Experiments, Reconciliation – folgen dem Switcher) · *Manage* (Shops für
  ADMIN+MEMBER, Users nur ADMIN – immer global). Shops ignoriert den Switcher; Klick auf eine Shop-Zeile setzt den Kontext.
- **Allowlisten/Freischalten eines Shops nur ADMIN** (bisher nicht geregelt) – braucht Guard + Test.
- **Experiments-Liste:** Status als Underline-Tabs mit Zählern (All · Running · Paused · Draft · Ended), Spalten
  Experiment · Status · Runtime · **Conversions** (statt Visitors) · **Result**. Result = Fortschritt der Stopp-Regel
  am kleineren Arm + „est. <Datum>" (ADR-0036), danach Urteil („B wins", „No clear difference", „B shipped",
  „Control kept"); SRM steht nur dort („Assignment broken"). *Ersetzt* plan.md 5a „Sample-Size-Fortschritt" (abgelöst).
- **Offen, nicht entschieden:** Goals-Tab Variante B (Tabelle pro Goal + aufklappbarer Chart). Widerspricht ADR-0037
  („Goals = nur Charts"); bräuchte ein ablösendes ADR.
- **Experiment-Formular (29.09./01.10., Figma-Seite „Experiment form“ – Entwurf, Review mit Joel läuft):** zwei Spalten.
  Links: *Basics* (Name, Key klein darunter, Hypothese) · *Goals* · *Where it runs* (URL-Regel, Devices, „Count a
  visitor“ = Trigger, Hide-until-ready) · *Variants* (Anteil im Test, Splits, pro Variante **zwei getrennte Editoren
  JS und CSS untereinander**, keine Tabs – Joel 01.10.; Control ohne Code). Rechts sticky **eine** Karte „When is it decided?“ mit nur **zwei Eingaben** (Joel
  01.10.): „Conversions per variant“ (= `minConversionsPerArm`) mit abgeleitetem „≈ 12,4 % detectable lift“ daneben,
  und „Minimum runtime [n] full weeks“ (UI schreibt `minDurationDays = 7·n`, `requireFullWeeks = true`). Darüber
  Baseline-CR mit Quelle, darunter die Laufzeit-Prognose. Salt beim Anlegen nicht sichtbar. „Save as draft“ legt nur
  `DRAFT` an.
  *Weicht ab von:* WP5a – Rechner nicht mehr „beidseitig“ (MDE ist nur noch abgeleitet, keine Eingabe),
  Primary metric kein festes Feld CR/RPV/AOV mehr; ADR-0036 – `requireFullWeeks` im UI nicht mehr abschaltbar,
  Laufzeit nur in ganzen Wochen (Feld im Modell bleibt, Lockern in DRAFT entfällt damit).
- **Custom Goals (Joel 01.10. – neu, nicht in plan.md):** eigene Karte *Goals*: links Dropdown „Primary – decides
  the test“ (CR/RPV/AOV und alle Custom Goals – auch ein Custom Goal kann Primary sein), rechts „Also measured“ als
  Pills (Custom Goals mit ×, gestrichelte Pill „+ Add goal“ öffnet das Modal). Custom Goals leben **pro Shop**,
  wiederverwendbar; Modal „Add goal“ = vorhandene wählen oder „New goal“ anlegen. Vier Typen: Klick auf Selector,
  Seitenaufruf (URL-Regel), Shopify-Standard-Event, eigenes Event per `shab.track('name')`. Zählt pro Visitor einmal
  (binomial wie CR). Basisrate für den Rechner aus früherem Test mit dem Goal, sonst manuell.
  *Weicht ab von:* plan.md §3 (kein Goal-Modell), 4.8 (Urteil nur auf CR/RPV/AOV), 4.9 (Charts pro Goal nur für die
  drei), rahmen.md §1/§3 (neue Event-Last und Retention). → braucht ADR + **neuen** Vertrag (Goal-Event-Payload,
  additiv zu 4.5), siehe Offen.
- **Figma:** Alle geteilten UI-Teile sind Komponenten auf „Foundations" (Sidebar, ShopSwitcher, Button, Badge, Icons,
  Table-Zellen …); Frames nutzen nur Instanzen. Noch alt: MobileTopBar, Checkbox/Radio/Input.

## Design-Entscheidungen (01.10., Figma gelesen – Experiments, Results, Experiment-Formular)

Gelesen wurden die Figma-Seiten **Experiments** (2-21), **Results** (2-20) und **Experiment form** (2-22), jeweils die
Struktur, nicht jedes Pixel. Noch nicht in plan.md/ADR eingearbeitet.

**⚠️ Scope-Konflikt: Das Formular setzt Custom Goals voraus.** Die Karte „Goals" hat ein *Primary*-Select und
*„Also measured"*-Pills, ein Modal „Add goal" wählt aus **shop-weiten** Goals (Add to cart · Size guide opened ·
Reached cart page · Checkout started · Quiz completed · Reviews tab clicked), ein Modal „New goal" legt neue an, mit
den Typen *page view* (URL-Regel), *Shopify event*, *custom event from code* und *Klick (Selektor)*. State 8 zeigt ein
Custom Goal als Primärmetrik. **Das ist exakt der Umfang, der am 01.10. in plan.md §9 als Phase 2 festgehalten wurde**
(`Metric` ist heute ein Enum `CR | RPV | AOV`, Vertrag 4.8 kennt nur Order-Conversions). Entweder zieht Phase 1 die
Custom Goals mit hoch – neuer Vertrag, neue Tabelle `GoalEvent`, Proxy-Route, Snippet-Arbeit, Web-Pixel-Extension für
Shopify-Events – oder das Formular wird ohne die Goals-Karte gebaut. **Entschieden (Joel, 01.10.): Weg B** – das Formular wird **ohne die Goals-Karte** gebaut, die Primärmetrik bleibt
vorerst das Drei-Werte-Select (`CR | RPV | AOV`). Custom Goals bleiben Phase 2 (plan.md §9); die Karte und die beiden
Modals kommen nach, wenn das Backend dafür steht. Begründung: sonst steht das ganze Dashboard, bis ein ungeplantes
Backend fertig ist. Mit entfällt vorerst auch **„Also measured"**.

**Zweite Modelländerung: „Also measured".** Heute zeigt der Report immer alle drei Metriken; im Entwurf wählt man aus,
welche mitgemessen werden. Das ist ein Feld am Experiment, das es nicht gibt.

**Experiments-Liste** (ergänzt die Einträge vom 28.09.)
- Sortierung **Running → Paused → Draft → Ended**; Zeilenklick öffnet Results.
- Der Shop steht als **Unterzeile in der Experiment-Zelle**, nicht in einer eigenen Spalte.
- Toolbar nur **Status-Tabs + Suche** – keine Filter-Chips, kein Spalten-Dropdown. Schlanker als plan.md WP5a.
- Result-Spalte: Running = Fortschrittsbalken (schwächerer Arm) + % + „est. <Datum>"; SRM = „Assignment broken" +
  Tooltip + „No verdict"; **Paused = Fortschritt + „not collecting while paused"**; Draft und Ended ohne Fortschritt.
- Der ShopSwitcher führt die **Zahl der Experimente je Shop**.

**Results** – sieben Overview-Zustände, fünf Tabs, vier Dialoge, Mobile durchgezeichnet.
- Zustände: `a-running-not-conclusive` · `b-rule-met-winner` · `c-rule-met-no-difference` · `d-srm-alarm` ·
  `e-guardrail-warning` · `f-ended-frozen` · `g-draft-zero-data`. Damit sind die in plan.md v4.3 offenen Leer- und
  „too few"-Zustände **erledigt**.
- **SRM schaltet das Urteil dauerhaft ab** – Alert oben, Tabelle gedimmt als „debugging only", Stop wird zu
  „Stop as invalid…". In plan.md ist SRM nur ein Badge in den Checks. **Funktionsänderung bis in die Service-Schicht.**
- `g-draft-zero-data`: „Before you start"-Checkliste (Hypothesis · Variant B code · Stopping rule · QA on the live
  store) mit Force-Links, leere Performance, einziger Primary-Button „Start…". In plan.md gar nicht vorgesehen.
- Dialoge Start · Pause · Stop-with-verdict · **Stop-early** („warns, never blocks, **offers Pause instead**", mobil
  als Bottom Sheet). Das Pause-Angebot ist neu.
- Blockreihenfolge bestätigt ADR-0037: performance → verdict-status/card → checks+distribution → setup+history.
  Die Performance-Tabelle scrollt horizontal mit **sticky Variant-Spalte**.
- Checks sind benannt: Assignment (SRM) · Guardrail · Bot traffic · Code edits while running · Tainted days.
- **Abweichungen von Vertrag 4.9:** Charts stehen per Default auf **Cumulative** (4.9 sagt das nur für Improvement),
  und ein **Edit-Marker erscheint im Chart** (plan.md hat ihn in den Checks).
- `tab-goals · table + chart (variant B)` existiert als Frame – widerspricht weiter ADR-0037 („Goals = nur Charts").

**Experiment-Formular** – zwei Spalten, rechts sticky die Karte „When is it decided".
- Elf durchgezeichnete Zustände, u. a.: Shop-Select nur wenn aus „All shops" geöffnet (1) · Selektorfeld erscheint
  beim Trigger „scrolls into view" (2) · **AOV als Primärmetrik erzeugt die Warnung aus 4.8** (3) · Inline-Validierung
  bei vergebenem Key (4) · **erster Test eines Shops → Baseline wird eingegeben statt abgeleitet** (5) · **Prognose
  über 6 Wochen → amber**, die Futility-Warnung aus ADR-0036 (6) · eigene Rechnung für RPV (7).
- Die Stopp-Regel bleibt im Entwurf **zwei Felder** (Conversions + „Minimum runtime" in Tagen); der Vorschlag, sie zu
  `minFullWeeks` zusammenzuziehen, ist nicht eingearbeitet.
- **Vermutlicher Entwurfsfehler:** „As soon as the page loads" und „When an element scrolls into view" sind als
  **Checkboxen** gezeichnet. Der Trigger ist laut Datenmodell exklusiv (`immediate` | `visible`), das müssen Radios
  sein. Nur „Hide the page until the variant is ready" ist eine echte Checkbox.
- In der Sidebar steht neben der Benutzer-Mail die Stopp-Regel („1.000 conversions per arm · 14 days · full weeks") –
  sieht nach einem **globalen Default** aus. Ort der Regel (global / pro Shop / pro Experiment) ist zu bestätigen.

## Offen
- ADR für Switcher-Kontext, Sidebar-Gruppen und ADMIN-only-Allowlist; plan.md WP5a entsprechend nachziehen.
- Entscheidung Deckungsindex für 1 Mio. Exposures (+238 MB, −40 ms) – Empfehlung: nein.
- WP6: Retention für `SnippetError`/`Exposure` in `/jobs/cleanup`, Cron `/jobs/daily-stats`; Lasttest auf Render vor WP7.
- **Shop in der URL?** (`/dashboard/s/<shop>/…`) – der Switcher-Vorschlag lässt das offen. Routing-Entscheidung, die
  vor WP5a fallen muss, weil sie die Route-Struktur festlegt.
- WP5b-Blocker: Donut-Rezept und gestyltes Tooltip-Popover in DESIGN.md, volle Verdict-Karte, Leer-/„too few"-Zustände,
  Figma-Statuszeile zeigt noch die abgelöste visitor-basierte Sample Size statt der Stopp-Regel (ADR-0036).
- WP-R: Distribution Method auf `sh-ab` prüfen (Public, irreversibel) → PCD Level 1 + `read_all_orders` → Listing.
  PCD wird **durch** das App Review freigegeben, das Listing liegt damit auf dem kritischen Pfad. Vor dem Einreichen
  „Limit visibility" setzen.
- **QA vor dem Start geht mit den aktuellen Verträgen nicht:** Force-Links (4.4) wirken nur auf Experimente im
  Metafield, und dort stehen nur `RUNNING` (4.2). Ein `DRAFT` ist also nicht per `?ab_force` prüfbar. Braucht eine
  Entscheidung (z. B. neuer additiver Vertrag für einen QA-Status) bevor der QA-Bereich im Formular Sinn ergibt.
- **Custom Goals – vor der Umsetzung zu klären:** (a) Shopify-Events gibt es nur über eine **App Pixel Extension**
  (`analytics.subscribe`, per Dev-MCP geprüft) – zweite Extension, review-relevant, Sandbox, Visitor-Bindung über
  `browser.cookie` (`_shab_vid`) noch zu prüfen. (b) Klick/Seitenaufruf/`shab.track` kosten Snippet-Budget (8 KB).
  (c) Neue Tabelle für Goal-Events + Retention 12 Monate wie `Exposure`. (d) Stopp-Regel und Rechner für ein Custom
  Goal als Primary. (e) Snapshot (`ExperimentResult`) muss Custom-Goal-Zahlen und -Definition einfrieren.
  (f) DESIGN.md hat kein Modal-Rezept.
- Formular offen: Hypothese Pflicht? Start-Button im Formular oder nur auf der Detailseite? Tempo-Quelle der
  Laufzeit-Prognose (letzter Test im Shop passt nicht zu anderem Targeting).
- Design als Nächstes: Mobile-Liste, Shops-Seite, Formular-Review, Edit-Zustand `RUNNING` (4.6).
