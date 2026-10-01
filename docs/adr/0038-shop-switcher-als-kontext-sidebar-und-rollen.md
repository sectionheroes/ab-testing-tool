# ADR-0038: Shop-Switcher als Kontext, Shop in der URL, Sidebar-Gruppen, Allowlist nur ADMIN

Datum: 2026-10-01 · Status: entschieden · konkretisiert WP5a, ändert keinen Vertrag

## Kontext
plan.md WP5a sagt zur Navigation nur „Experiments pro Shop und global" – nicht, wo der Wechsel stattfindet. Die
Design-Session am 28.09. hat dafür einen **Shop-Switcher** oben in der Sidebar entworfen und daran drei weitere
Entscheidungen gehängt, die seitdem in STATUS.md als offen stehen: die Sidebar-Gruppierung, die Frage, ob der Shop in
der URL lebt, und dass Allowlisten nur ADMIN darf.

Die Design-System-Session am 01.10. hat die Sidebar deshalb bewusst **nur restyled und nicht umgehängt**, mit der
Begründung, die Gruppierung sei eine IA-Entscheidung und brauche ein ADR. Ohne diese Entscheidung bauen WP5a und das
Designsystem gegeneinander.

## Entscheidung

**1. Der Shop-Switcher ist der Kontext der Testing-Seiten.** Oben in der Sidebar, listet die `ACTIVE`-Shops plus
„All shops", zeigt je Shop die Zahl der Experimente und endet mit „Manage shops →". Bei gewähltem Shop zeigt die
Experiments-Liste keine Shop-Angabe und „New experiment" legt direkt für diesen Shop an; unter „All shops" steht der
Shop als Unterzeile in der Experiment-Zelle und „New experiment" fragt zuerst nach dem Shop.

**2. Der Shop lebt in der URL:** `/dashboard/s/:shop/experiments`, mit `all` als gültigem Wert für die globale Sicht.
Der zuletzt gewählte Shop wird in `localStorage` gemerkt, aber **nur für die Landing-Route nach dem Login** – nie als
Quelle der Wahrheit. Loader lesen `params.shop`.

**3. Sidebar-Gruppen.** *Testing*: Experiments, Reconciliation – folgen dem Switcher. *Manage*: Shops (ADMIN und
MEMBER), Users (nur ADMIN) – immer global, ignorieren den Switcher. Ein Klick auf eine Shop-Zeile setzt den Kontext
und springt in die Testing-Sicht dieses Shops.

**4. Allowlisten einer Domain und Freischalten eines `PENDING`-Shops sind ADMIN-only**, erzwungen in der
**Service-Schicht**, nicht nur im UI, mit Test. Bisher war das nirgends geregelt.

## Alternativen
- **Kontext im Session-State oder Cookie statt in der URL** – spart Routen, bricht aber zwei Browser-Tabs auf zwei
  Shops (der Agentur-Alltag), Deep-Links, Bookmarks, Zurück-Button und Reload. Der Zustand wäre global und versteckt,
  und Loader wären nur mit Aufwand testbar. Verworfen.
- **Shops unter *Testing* lassen** (der heutige Stand) – Shops ignoriert den Switcher, steht also in einer Gruppe,
  deren gemeinsames Merkmal es nicht erfüllt. Die Gruppierung würde das Gegenteil von dem behaupten, was sie tut.
- **Allowlisten auch für MEMBER** – das Freischalten entscheidet, welcher Shop Daten in unsere DB schreiben darf.
  Das ist eine Vertrags- und keine Betriebsfrage.
- **Eigene Route je Sicht statt `all` als Shop-Wert** (`/dashboard/experiments` neben `/dashboard/s/:shop/experiments`)
  – zwei Layouts, zwei Loader, derselbe Inhalt. `all` als regulärer Wert hält es bei einem.

## Konsequenzen
- Die Testing-Routen ziehen unter `/dashboard/s/:shop/` um. Bestehende Links auf `/dashboard/experiments` müssen auf
  die gemerkte oder auf `all` umleiten.
- Die Design-System-Session hat die Sidebar bewusst nicht umgehängt; **dieses ADR hebt diese Zurückhaltung auf**, das
  Umhängen gehört in WP5a.
- Drei Guards statt einem: Shops für ADMIN und MEMBER, Users nur ADMIN, Allowlisten/Freischalten nur ADMIN. Alle in
  der Service-Schicht, weil das CLI in 5c dieselbe Schicht nutzt.
- plan.md WP5a ist an diesen Punkten überholt und wird nachgezogen.
- Die Zahl der Experimente je Shop im Switcher ist eine zusätzliche Abfrage auf jeder Testing-Seite – klein, aber sie
  gehört in denselben Loader wie die Shop-Liste und nicht in eine eigene Runde.
