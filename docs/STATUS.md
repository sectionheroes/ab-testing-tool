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
- **Figma:** Alle geteilten UI-Teile sind Komponenten auf „Foundations" (Sidebar, ShopSwitcher, Button, Badge, Icons,
  Table-Zellen …); Frames nutzen nur Instanzen. Noch alt: MobileTopBar, Checkbox/Radio/Input.

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
- Design als Nächstes: Mobile-Liste, Shops-Seite, Formular.
