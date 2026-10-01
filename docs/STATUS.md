# Status
Stand: 2026-10-02

## Aktuell
**WP5a gebaut**, Branch `wp5a-dashboard`, PR gegen `main`. Die Vorgänger-Session hat das Designsystem an Figma
angeglichen; diese hat die Seiten daraus **zusammengesetzt** – keine Klasse von Hand. **512 Unit-Tests, 106 DB-Tests,
typecheck und lint grün. Abnahme WP5a komplett pass**, Belege in `docs/screenshots/wp5a/` (32 Screenshots, jede Seite
in beiden Themes) und im PR-Text.

**Gebaut:** Navigation nach ADR-0038 (Shop in der URL, Switcher mit Experiment-Zahlen aus demselben Loader, Gruppen
*Testing* / *Manage*, alte Links leiten um; `localStorage` entscheidet nur die Landing-Route) · Experiments-Liste
(2-21) · Experiment-Formular (2-22, Rechner einwegs, `lib/stats` unangetastet, zwei CodeMirror-Editoren je Variante) ·
kleine Experiment-Seite mit Start/Pause, Setup, QA-Force-Links und History (**nicht** Results) · Shops · Users ·
Reconciliation · Glossar (`app/lib/glossary.ts`). Jeder Guard liegt in der Service-Schicht: Allowlisten/Freischalten
und alle User-Mutationen ADMIN-only (ADR-0038, mit Test), 4.6 in `updateExperiment`, die Stopp-Regel in
`setStoppingRule`.

**Gegen den Dev Store gefahren:** anlegen → Save as draft → Start (Metafield geschrieben) → Code-Hotfix auf `RUNNING`
(AuditLog `CODE_CHANGED_WHILE_RUNNING`, Metafield sofort aktualisiert) → Targeting-Änderung abgelehnt → Stopp-Regel
lockern abgelehnt → Pause (Experiment fällt aus dem Metafield). Der Dev Store ist wieder wie vorher.

**Vier Befunde beim Zusammenbauen, alle behoben:** (1) **`Alert` war farblos** – die Klassen entstanden per
Interpolation, also hat Tailwind `.alert-warning` nie erzeugt; die von 4.8 geforderte AOV-Warnung war ein graues
Kästchen. (2) **Die native Browser-Validierung schluckte die eigene** (`step={100}` machte 1000 ungültig) → jetzt
`noValidate`. (3) **4.6 verglich zu streng**: ein `targeting` aus älterer Schreibweise (WP2-Seed: `{}`) sah nach einer
Änderung aus und hätte den Hotfix gesperrt → beide Seiten normalisiert, Device-Liste in fester Reihenfolge.
(4) **Teilweise gespeichert**, wenn die Stopp-Regel ablehnte → die Regel läuft jetzt zuerst.

**Bewusste Abweichungen von Figma:** Progress-Balken **neutral grau** statt emerald (DESIGN.md §7/ADR-0037 – offen,
siehe unten) · **keine Goals-Karte** (Weg B, Phase 2); die Primärmetrik sitzt als Drei-Werte-Select in „Basics", weil
eine Karte „Goals" mit einem Select das fehlende Feature verspräche · **kein QA-Bereich im DRAFT** (4.2/4.4) ·
„est. 06.10.**2026**" mit Jahr · **Trigger als Radios** – der Auftrag nannte das einen Zeichenfehler, der Designer hat
am 01.10. nachgesehen: in Figma sind es bereits `Radio`-Instanzen, es gab nichts zu korrigieren · „≈ 12,5 %" statt
12,4 % (aus `mdeFromConversions`, nicht aus dem Entwurf) · Users und Reconciliation sind nicht gezeichnet.

**Bewusst nicht gebaut:** die **Results-Seite** (WP5b) und der **Stop-Dialog** (siehe Offen).

**Neu im Repo:** `pnpm seed:demo` und `pnpm screenshots <ordner>`; beide nur gegen `localhost` (`scripts/local-only.ts`).
Eine Listenzeile mit **erfüllter** Stopp-Regel braucht für ihr Urteil die volle Aggregation (höchstens zwölf je
Seite); alles andere läuft über `listCounts()` – eine Abfrage für alle Zeilen, dieselben Zählregeln wie 4.8,
festgenagelt gegen `computeExperimentStats` in `experiment-list.server.db.test.ts`.

**Abnahme a–n von WP4.1 bleibt pass** (PR #5, `d032124`); Lasttest realistisch 120–205 ms, 1 Mio. 547–1.124 ms.

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
- **Übertragung nach Code (01.10., WP5a):** Figma arbeitet ohne Variablen, jeder Wert ist rohes Hex. Übertragen heißt
  deshalb **abbilden, nicht abschreiben** – die Regel steht jetzt in DESIGN.md §9 samt Grauton-Tabelle, und zwei
  Tests halten sie (`app/design-system.test.ts`: kein Hex und keine `slate-*`/`emerald-*`-Klasse in `className`).
  **Vom Designer zu bestätigen:** (a) das **Tooltip-Popover** – Figma hat nur den Trigger, das Popover ist aus den
  §2-Tokens entworfen; (b) **Checkbox, Radio, Input, MobileTopBar** – in Figma als veraltet markiert, deshalb nicht
  abgezeichnet, sondern aus dem aktuellen Token-Satz gebaut; (c) alle **Light-Werte** der neuen Tokens, denn Figma
  zeichnet nur Dark.
- **Bewusste Abweichungen von Figma** (jede mit Grund, nachzusehen in `/dashboard/styleguide`):
  1. **Icons** als Lucide-Strichpfade mit 24er-Viewbox statt der Figma-Exporte. Die Exporte sind flachgerechnete
     Outlines mit 16er-Viewbox, nehmen kein `currentColor` an und liegen auf URLs, die nach sieben Tagen ablaufen.
     Die Figma-Icons *sind* Lucide, bei 16px ergibt `strokeWidth 2` genau 1,33px – dasselbe Bild.
  2. **Grautöne über Opacity** (`text-base-content/60`) statt der Slate-Hexes. Das verlangt DESIGN.md §4; es kostet
     etwas Blaustich.
  3. **Badge-Flächen** als `bg-success/20` usw. statt Figmas -500-Tönen bei 20 %. Unterschied unter der
     Wahrnehmungsschwelle, spart vier Tokens.
  4. **`--color-info` im Dark von Lila auf Sky** – Figma färbt den „ended"-Badge Sky; Lila bleibt `secondary` und
     damit dem Plan-/Feature-Label vorbehalten (§4).
  5. **Favicon-Farben im ShopSwitcher** aus der Domain abgeleitet statt fix pro Shop. Eine `Shop.color`-Spalte für
     eine Dekoration wäre die falsche Art von dauerhaft.
  6. **Sidebar-Gruppierung unverändert** (Testing: Shops/Experiments/Reconciliation · Admin: Users). Figmas
     Testing/Manage-Schnitt ist eine IA-Entscheidung, die unten als offen steht und ein ADR braucht – restylen ja,
     umhängen nein.

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
- ~~Die Stopp-Regel bleibt im Entwurf zwei Felder~~ – **überholt**: Die Karte „When is it decided?" hat seit 01.10.
  nur noch „Conversions per variant" und „Minimum runtime [n] full weeks" (siehe Eintrag Experiment-Formular oben).
- ~~Vermutlicher Entwurfsfehler: Trigger als Checkboxen~~ – **kein Fehler** (Designer, 01.10.): In allen Frames der
  Seite „Experiment form" sind „As soon as the page loads" / „When an element scrolls into view" Instanzen von
  `Radio`, nur „Hide the page…" ist `Checkbox`. In Figma nichts nachzuziehen; WP5a baut Radios, wie geplant.
- ~~Stopp-Regel in der Sidebar~~ – **Lesefehler**: Der Text „joel@… · stopping rule 1.000 conversions per arm · 14 days ·
  full weeks" ist die Zeile *Created* in der **History** (AuditLog-Eintrag beim Anlegen), nicht die Sidebar. Die Regel
  liegt pro Experiment (Datenmodell), Defaults 1.000 / 14 / volle Wochen aus ADR-0036.

## Design-Entscheidungen (01.10. abends, Figma – WP5b-Blocker, noch nicht in plan.md/ADR)
- **Donut entworfen** – Komponenten `Chart/Donut`, `Chart/LegendItem`, `Chart/DonutBlock` + Spec-Tafel auf
  Foundations, Rezept DESIGN.md §7 „Donut". Alle 51 Donuts auf der Results-Seite sind jetzt Instanzen. Entschieden:
  **Prozent sichtbar** in der Legende (Anteilsfrage; absolute Zahlen je Segment stehen in der Tab-Tabelle),
  **Gesamtzahl in der Mitte**, **Hover/Tap** zeigt in der Mitte die absolute Zahl des Segments. 104 px, Ring 14,
  2°-Lücken, größtes Segment zuerst, Other/Unknown zuletzt. Leerzustand und Ein-Segment-Fall gezeichnet.
  **Neu: Grau als fünfte Chart-Farbe** (`#64748b`, nur für Other/Unknown) in DESIGN.md §4 – die Palette hatte keine
  neutrale Farbe, und Grün/Rot sind für Urteile reserviert.
- **Modal-Rezept** – Bausteine `Modal/Header`, `Modal/Footer` (inline/stacked × default/destructive × idle/busy),
  `Modal/Callout`, `RadioCard`, `Field/Label`, `Textarea`, `Modal/Handle`, `Modal/Scrim`, `Icon/spinner`; die vier
  Results-Dialoge, das Bottom Sheet und zwei neue Frames (busy, langer Body) sind daraus gebaut. Entschieden:
  Breiten 480 (Bestätigung) / 560 (mit Formular), max. Viewport − 64, nur der Body scrollt, Scrim als **neues Token
  `scrim`**, Schatten `shadow-xl`. **Unter 640 px ist jedes Modal ein Bottom Sheet**, nicht nur Stop early.
  Scrim-Klick schließt nicht, sobald ein Feld Eingaben hat. Busy: Spinner, alles gesperrt, Escape wirkungslos.
  *Weicht ab von:* plan.md WP5b spricht vom „decision-Select" – gezeichnet und spezifiziert ist eine Gruppe
  **RadioCards** (jede Option mit Erklärung, nicht erlaubte bleiben sichtbar-disabled). Fachlich gleich (`decision`
  Pflicht, vier Werte).
- **Statuszeile korrigiert**: Die Figma-Frames zeigten bereits die drei Bedingungen aus ADR-0036, nicht mehr „40 % of
  12.000 visitors" (der Eintrag in plan.md WP5b/ADR-0037 ist damit erledigt). Nachgezogen: „Verdict est." →
  **„Evaluable on <Datum>"**, Fortschrittsbalken **neutral** statt grün (war ein Verstoß gegen §10/Progress-Rezept),
  mobil steht „Evaluable on" als eigene letzte Zeile (das Datum wurde abgeschnitten). Die Planwerte (Baseline, MDE,
  α, Power) stehen im neuen **rich Tooltip-Popover** als letzte Zeile.
- **Designer-Abnahme der Code-Übertragung** (Details DESIGN.md §2/§7): Tooltip-Popover **bestätigt** (`base-300`,
  Rand `base-400`) – Figma hatte für den rich-Tooltip `base-200`, jetzt angeglichen; neue Komponente
  `Tooltip/Popover` (simple · rich). **Checkbox/Radio/Input/MobileTopBar** in Figma als aktuell markiert, mit drei
  Code-Korrekturen: Input `bg-base-100` (vertieft) und 40 px statt `bg-base-200`/38 px; gesetzte Checkbox/Radio über
  **neues Token `control-checked`** (im Light Mode ist das gesetzte Mint-Radio auf Weiß kaum sichtbar);
  MobileTopBar wie Figma (Logo links, Menü rechts, kein Seitentitel). **Light-Werte** sonst stimmig; Styleguide-Texte
  „Allocation must be between 0 and 1" und „1000" sind für Laien falsch (Prozent, de-DE).
- Die zwei neuen Tokens (`scrim`, `control-checked`) stehen **nur in der DESIGN.md-Tabelle**, noch nicht im
  §2-CSS-Block und nicht in `app/app.css` – die WP5a-Session arbeitet parallel im Working Tree. Beim Übernehmen beides
  im selben Commit ändern, sonst wird `app/design-system.test.ts` rot.

## Offen
- **plan.md WP5a nachziehen.** Der Abschnitt beschreibt noch den beidseitigen Rechner, eine feste Sample-Size-Spalte,
  Filter-Chips und Navigation ohne Shop in der URL. Gebaut ist der Stand aus STATUS/ADR-0038; die Verträge in §4 sind
  unberührt. Dazu: der QA-Bereich im Formular (Force-Links im DRAFT) entfällt, die Goals-Karte ist Phase 2.
- **Vom Designer zu entscheiden: Farbe des Fortschrittsbalkens in der Experiments-Liste.** Figma zeichnet ihn emerald,
  gebaut ist er neutral grau nach DESIGN.md §7/ADR-0037. Dieselbe Frage wurde in der Results-Statuszeile am 01.10.
  zugunsten von neutral entschieden – wenn das auch hier gilt, stimmt Figma 2-21 nicht mehr.
- **Die Korrekturen der Design-Session vom 01.10. abends sind noch nicht im Code:** die zwei neuen Tokens (`scrim`,
  `control-checked`) stehen nur in der DESIGN.md-Tabelle, nicht im §2-CSS-Block und nicht in `app/app.css`; dazu
  Input auf `bg-base-100`/40 px und MobileTopBar ohne Seitentitel. Alles in **einem** Commit, sonst wird
  `app/design-system.test.ts` rot. Gehört in die Session, die als Nächstes am Designsystem arbeitet – diese hier hat
  bewusst nicht in `app.css` gegriffen.
- **Der Stop-Dialog fehlt, also kann ein Experiment im UI nicht beendet werden.** Bewusst: er verlangt `decision` +
  `conclusion`, warnt bei unerfüllter Stopp-Regel, bietet Pause an und friert endgültig ein (ADR-0025/0036) – das ist
  WP5b, und das Modal-Rezept dafür ist erst seit dem 01.10. abends gezeichnet. Bis dahin geht Stop über die
  Service-Schicht (`pnpm experiment:status`) und ab 5c über die CLI.
- ~~ADR für Switcher-Kontext, Sidebar-Gruppen und ADMIN-only-Allowlist~~ → **ADR-0038 (01.10.)**: Switcher ist der
  Kontext, **Shop in der URL** (`/dashboard/s/:shop/…`, `all` als Wert), Gruppen *Testing* / *Manage*, Allowlisten nur
  ADMIN in der Service-Schicht. Hebt zugleich die Zurückhaltung der Design-System-Session beim Umhängen der Sidebar
  auf. plan.md WP5a noch nachzuziehen.
- Entscheidung Deckungsindex für 1 Mio. Exposures (+238 MB, −40 ms) – Empfehlung: nein.
- WP6: Retention für `SnippetError`/`Exposure` in `/jobs/cleanup`, Cron `/jobs/daily-stats`; Lasttest auf Render vor WP7.
- **Attributions-Abdeckung vor WP7 prüfen** (Befund aus der WP4.1-Abnahme, hier aufbewahrt, weil er offen ist): Die
  zwei Pfade versagen unterschiedlich. Das **Cart-Attribut** übersteht Line-Item-Merges (Bundle-Apps,
  `cartTransform`), fehlt aber bei „Buy Now"; die **Line-Item-Property** deckt Buy Now, kann aber bei Bundle- und
  Ajax-Cart-Apps verlorengehen, die ihr Payload von Hand bauen statt `FormData` zu nehmen. **Headless (Hydrogen) ist
  gar nicht abgedeckt** – Onboarding-Voraussetzung, keine Lücke. Fällt beides aus, greift der ADR-0032-Fallback und
  die Order landet sichtbar in `unknown`. Die **86 % Device-Link-Rate gelten für ein Standard-Theme ohne
  Drittanbieter-Apps**; gezielt gegen die Apps testen, die unsere Kunden einsetzen. Ebenso erneut prüfen, dass
  `_ab_v` auf einem **Kunden-Theme** nicht in der Bestätigungsmail und nicht auf der Order-Status-Seite auftaucht –
  am Dev-Store mit Standard-Theme gemessen, nicht aus der Doku belegt.
- WP5b-Blocker, Stand 01.10. abends: **Donut, Modal, Tooltip-Popover und Statuszeile erledigt** (DESIGN.md §7,
  Figma Foundations + Results). Die volle Verdict-Karte und die Leerzustände sind in den Results-Frames b, c und g
  gezeichnet; **noch nicht gezeichnet ist der „too few"-Zustand** (Strich mit Tooltip in Segmenttabellen, 4.10) – klein,
  aber nicht blockierend. plan.md WP5b „Vor 5b zu klären" und ADR-0037 „offener Konflikt" können als erledigt
  markiert werden (plan.md-Edit steht aus).
- **Logo:** die Shell zeigt weiter die Text-Wortmarke; die PNGs aus DESIGN.md §4 liegen nicht im Repo.
- WP-R: Distribution Method auf `sh-ab` prüfen (Public, irreversibel) → PCD Level 1 + `read_all_orders` → Listing.
  PCD wird **durch** das App Review freigegeben, das Listing liegt damit auf dem kritischen Pfad. Vor dem Einreichen
  „Limit visibility" setzen.
- **QA vor dem Start geht mit den aktuellen Verträgen nicht:** Force-Links (4.4) wirken nur auf Experimente im
  Metafield, und dort stehen nur `RUNNING` (4.2). Ein `DRAFT` ist also nicht per `?ab_force` prüfbar. Braucht eine
  Entscheidung (z. B. neuer additiver Vertrag für einen QA-Status) bevor der QA-Bereich im Formular Sinn ergibt.
  **Für WP5a entschieden (Joel, 01.10.): vorerst weglassen** – Force-Links erscheinen nur bei `RUNNING`/`PAUSED`.
  Die Session baut nichts, das nachweislich nicht funktioniert; der QA-Status wird separat entschieden. Betrifft auch
  die „Before you start"-Checkliste in `g-draft-zero-data` (WP5b).
- **Custom Goals – vor der Umsetzung zu klären:** (a) Shopify-Events gibt es nur über eine **App Pixel Extension**
  (`analytics.subscribe`, per Dev-MCP geprüft) – zweite Extension, review-relevant, Sandbox, Visitor-Bindung über
  `browser.cookie` (`_shab_vid`) noch zu prüfen. (b) Klick/Seitenaufruf/`shab.track` kosten Snippet-Budget (8 KB).
  (c) Neue Tabelle für Goal-Events + Retention 12 Monate wie `Exposure`. (d) Stopp-Regel und Rechner für ein Custom
  Goal als Primary. (e) Snapshot (`ExperimentResult`) muss Custom-Goal-Zahlen und -Definition einfrieren.
  (f) ~~DESIGN.md hat kein Modal-Rezept~~ – erledigt (§7 „Modal").
- ~~Formular offen~~ → entschieden (Joel/Claude, 01.10.): **Hypothese nicht Pflicht** (Disziplin, keine Validierung) ·
  **Start nur auf der Detailseite**, das Formular endet mit „Save as draft" · die **Tempo-Quelle wird beschriftet**
  („at the pace of your last test in this shop") statt Exaktheit vorzutäuschen – bei anderem Targeting stimmt sie nicht.
- Design als Nächstes: Mobile-Liste, Shops-Seite, Edit-Zustand `RUNNING` (4.6), „too few"-Zelle; im Formular die
  Goals-Karte als Phase 2 kennzeichnen (Weg B) und den Drei-Werte-Select für die Primärmetrik zurückzeichnen.
