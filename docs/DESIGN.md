# DESIGN.md — Sectionheroes Admin-Look

Design-Spec für neue Software, die exakt wie das Sectionheroes-Admin-Dashboard aussehen soll.
Diese Datei ist als Anweisung für Claude Code gedacht: **Halte dich beim Bauen von UI strikt an
diese Tokens, Klassen und Rezepte.** Nicht improvisieren, keine anderen UI-Libraries.

Diese Datei beschreibt **Bausteine**, keine Seiten. Was auf einer konkreten Seite steht, steht in
`docs/plan.md` §5 – die Results-Seite mit ihren fünf Tabs in **WP5b**, die zugrunde liegenden Definitionen in den
Verträgen 4.8 (Zählweise), 4.9 (Zeitreihen) und 4.10 (Segmente). Für die Results-Seite gebraucht werden aus dieser
Datei die Rezepte **Segmented Tabs**, **DateRange-/Dropdown-Trigger**, **Tooltip**, **Accordion/Chevron**,
**Chart-Tooltip & Legende** und die Chart-SVGs, dazu **§10 Content-Regeln**.

> **Verweise immer über den Abschnittsnamen, nie über eine Zeilennummer.** Frühere Angaben wie „§390" oder „§506"
> waren Zeilennummern und sind mit jeder Ergänzung verrutscht.
>
> Erledigt am 01.10. (Design-Session für WP5b): **Donut** und **Modal** haben Rezepte in §7, beide als Komponenten auf
> Figma „Foundations“ (Section „Lab components · Charts & overlays“). Neu dafür: das Token `scrim` (§2-Tabelle) und
> Grau als fünfte Chart-Farbe (§4). Tooltip-Popover, Checkbox, Radio, Input und MobileTopBar sind vom Designer
> bestätigt bzw. korrigiert (jeweils im Abschnitt).
>
> Erledigt am 27.09.: Der Lab-Look steckt in den Theme-Tokens (§2), die Underline-Tabs haben ein Rezept (§7).
> Erledigt am 01.10. (WP5a): Das **gestylte Tooltip-Popover** steht in §7 und ersetzt das native `title` – das ließ
> sich nicht stylen, erschien verzögert und funktionierte auf Touch gar nicht, und die Results-Seite trägt nach §10
> rund zehn Glossar-Tooltips. Dazu kamen die Lab-Komponenten aus den Figma-Foundations: Button auf sieben Stile,
> Tabellenzellen mit hervorgehobener Primärmetrik-Spalte, Progress, Chip, Pagination, Segmented, Dropdown-Trigger,
> ShopSwitcher und 36 Icons. Alle als React-Komponenten unter `app/components/`, alle in
> **`/dashboard/styleguide`** (nur Development) in jeder Variante und in beiden Themes nachzusehen.

---

## 1. Stack

- **React** (JSX, kein TypeScript nötig) + **React Router v7** (Framework-Mode)
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **daisyUI 5** (`@plugin "daisyui"`)
- **Kein** Polaris, kein shadcn, kein MUI, keine Icon-Library — Icons sind kleine Inline-SVGs
- Gilt für das Dashboard und den Login. Die embedded Shopify-Merchant-Seite `/app/*` ist ausgenommen: dort ausschließlich Polaris Web Components, keine DESIGN.md-Bausteine (siehe `docs/adr/0029`).
  (24er-Viewbox, `stroke="currentColor" strokeWidth="2"`, 15–16px groß)
- Charts: handgeschriebene SVGs (Area, Sparkline, Donut), keine Chart-Library
- Font: **Geist** für alles, **Geist Mono** für IDs, Keys, Daten, E-Mail-Adressen (beide über Google Fonts),
  Fallback `system-ui` bzw. `ui-monospace`

```bash
npm i tailwindcss @tailwindcss/vite daisyui
```

```js
// vite.config.js
import tailwindcss from "@tailwindcss/vite";
export default { plugins: [tailwindcss(), /* reactRouter() ... */] };
```

---

## 2. Theme-CSS (komplett übernehmen)

Zwei Themes:
- `dark` – **Lab-Look** (seit 27.09.2026, entspricht den Figma-Foundations, Collection „Theme“ Mode Dark):
  Slate-Flächen, Emerald als einziger Akzent, **invertierter Primary** (helle Fläche, dunkle Schrift). Tiefe entsteht
  über Borders, nicht über Schatten.
- `light` – unverändert der bisherige warme Look mit Mint + Lila. Wird separat angepasst; bis dahin nicht anfassen.

Zusätzlich zu den daisyUI-Tokens gibt es eigene Tokens, die als Tailwind-Farben verfügbar sind
(`border-border-strong`, `bg-base-400`, `text-nav-active` …). Ihre Light-Werte bilden den alten Look nach, soweit es
ihn gibt; die in WP5a dazugekommenen sind im Light Mode **provisorisch und nicht designt** (Figma zeichnet nur Dark).

| Token | Dark | Light | Wofür |
|---|---|---|---|
| `border-strong` | `#475569` slate-600 | `#e5e1e1` | Outline von Default-/Secondary-Button, „+ Add"-Chip, neutraler Progress-Fill |
| `base-400` *(neu 01.10.)* | `#334155` slate-700 | `#d9d4d4` *(provisorisch)* | Die Stufe zwischen `base-300` und `border-strong`: **gehobene Fläche** (aktives Segmented-Item, aktiver Filter) und **leiser Rahmen** (ghost-outline-Button, IconButton, Pagination, Popover-Rand) |
| `danger-solid` *(neu 01.10.)* | `#ef4444` red-500 | `#d63c3c` | Der **gefüllte** Destruktiv-Button. Nicht `error`: daisyUIs `btn-error` ist das helle Rot mit dunkler Schrift, Figma will das satte Rot mit weißer Schrift |
| `danger-solid-content` *(neu 01.10.)* | `#ffffff` | `#ffffff` | Schrift darauf |
| `success-solid` *(neu 01.10.)* | `#10b981` emerald-500 | `#23884a` | Der **gefüllte** Progress-Balken. Bei voller Deckkraft ist der Unterschied zu `success` (emerald-400) sichtbar, bei 20 % nicht – deshalb nur hier ein eigener Wert |
| `nav-active` / `-bg` / `-line` | Emerald-Satz | alter Look | Aktiver Nav-Eintrag (§6) |
| `scrim` *(neu 01.10.)* | `rgb(2 6 23 / 0.72)` slate-950 @ 72 % | `rgb(28 27 27 / 0.45)` | Fläche hinter jedem Modal (§7 „Modal"). Dunkelt in **beiden** Themes ab – `bg-base-100/70` würde im Light Mode aufhellen, `bg-black` verbietet §9 |
| `control-checked` / `-content` *(neu 01.10.)* | `#f8fafc` / `#0f172a` (= primary) | `#1c1b1b` / `#ffffff` | Fläche/Haken einer **gesetzten** Checkbox und Ring/Punkt eines gesetzten Radios. Im Light Mode ist Primary Mint, und Mint auf Weiß ist als „an" kaum von „aus" zu unterscheiden |

> Beide stehen seit 02.10. als `--sh-scrim` / `--sh-control-checked*` im §2-CSS-Block **und** in `app/app.css`,
> samt `@theme`-Zeile – `app/design-system.test.ts` hält beide byte-gleich.

**`--color-info` ist im Dark Mode seit 01.10. Sky statt Lila** (`#7dd3fc`, Fläche `bg-info/20`). Figma nutzt es für
den „ended"-Badge; Lila bleibt `secondary` und damit dem Plan-/Feature-Label vorbehalten (§4).

```css
/* app/app.css */
@import "tailwindcss";

@plugin "daisyui" {
  themes: false;
}

/* ── Dark (Lab-Look: Slate + Emerald) ────────────────────────────────────── */
@plugin "daisyui/theme" {
  name: "dark";
  default: false;
  prefersdark: true; /* greift automatisch bei OS-Dark-Mode */
  color-scheme: dark;

  --color-base-100: #020617; /* slate-950 – Seiten-Hintergrund */
  --color-base-200: #0f172a; /* slate-900 – Panels / Cards / Inputs */
  --color-base-300: #1e293b; /* slate-800 – Borders, aktive Tabs, Hover auf Inputs */
  --color-base-content: #f1f5f9; /* slate-100 */

  --color-primary: #f8fafc;         /* slate-50 – Hauptaktion, invertiert (helle Fläche) */
  --color-primary-content: #0f172a; /* IMMER dunkle Schrift auf Primary */
  --color-secondary: #c5acd3;       /* Lila – nur Plan-/Feature-Label */
  --color-secondary-content: #000000;
  --color-accent: #34d399;          /* emerald-400 – aktiv / positiv */
  --color-accent-content: #022c22;
  --color-info: #7dd3fc;            /* sky-300 – "ended"/neutral-informativ (WP5a, war Lila) */
  --color-info-content: #082f49;

  --color-neutral: #1e293b;         /* Unsaved-Changes-Bar */
  --color-neutral-content: #f1f5f9;

  --color-success: #34d399;         /* emerald-400 */
  --color-success-content: #022c22;
  --color-warning: #fbbf24;         /* amber-400 */
  --color-warning-content: #451a03;
  --color-error: #f87171;           /* red-400 */
  --color-error-content: #450a0a;

  --radius-selector: 0.5rem;
  --radius-field: 0.5rem;  /* Inputs/Buttons 8px */
  --radius-box: 0.75rem;   /* Cards/Tabellen/Dropdowns 12px */
  --size-selector: 0.25rem;
  --size-field: 0.25rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}

/* ── Light ───────────────────────────────────────────────────────────────── */
@plugin "daisyui/theme" {
  name: "light";
  default: true; /* Fallback ohne data-theme und ohne OS-Dark-Mode */
  color-scheme: light;

  --color-base-100: #f6f4f4; /* Seiten-Hintergrund (warmes Hellgrau) */
  --color-base-200: #ffffff; /* Panels / Cards / Inputs */
  --color-base-300: #e5e1e1; /* Borders, aktive Tabs */
  --color-base-content: #1c1b1b;

  --color-primary: #9dd1bb;         /* Mint */
  --color-primary-content: #000000;
  --color-secondary: #c5acd3;
  --color-secondary-content: #000000;
  --color-accent: #c5acd3;
  --color-accent-content: #000000;
  --color-info: #0369a1;            /* sky-700 – lesbar auf Weiß (provisorisch, nicht designt) */
  --color-info-content: #ffffff;

  --color-neutral: #1c1b1b;         /* Unsaved-Bar bleibt dunkel (wie Shopify) */
  --color-neutral-content: #edeaea;

  /* Status-Farben dunkler, damit text-success / -soft-Varianten auf Weiß lesbar sind */
  --color-success: #23884a;
  --color-success-content: #ffffff;
  --color-warning: #a9720f;
  --color-warning-content: #ffffff;
  --color-error: #d63c3c;
  --color-error-content: #ffffff;

  --radius-selector: 0.5rem;
  --radius-field: 0.5rem;
  --radius-box: 0.75rem;
  --size-selector: 0.25rem;
  --size-field: 0.25rem;
  --border: 1px;
  --depth: 0;
  --noise: 0;
}

/* ── Eigene Tokens (Light-Werte = alter Look, Dark-Werte = Lab-Look) ─────── */
:root, [data-theme="light"] {
  --sh-border-strong: #e5e1e1;                                   /* Outline des Default-Buttons */
  --sh-base-400: #d9d4d4;                                        /* provisorisch, nicht designt */
  --sh-danger-solid: #d63c3c;
  --sh-danger-solid-content: #ffffff;
  --sh-success-solid: #23884a;
  --sh-nav-active: #1c1b1b;                                      /* Text aktiver Nav-Eintrag */
  --sh-nav-active-bg: color-mix(in oklab, #1c1b1b 10%, transparent);
  --sh-nav-active-line: transparent;                             /* 2px-Linie links */
  --sh-scrim: rgb(28 27 27 / 0.45);                              /* Fläche hinter jedem Modal */
  --sh-control-checked: #1c1b1b;                                 /* gesetzte Checkbox / gesetztes Radio */
  --sh-control-checked-content: #ffffff;
}
[data-theme="dark"] {
  --sh-border-strong: #475569;                                   /* slate-600 */
  --sh-base-400: #334155;                                        /* slate-700 */
  --sh-danger-solid: #ef4444;                                    /* red-500 */
  --sh-danger-solid-content: #ffffff;
  --sh-success-solid: #10b981;                                   /* emerald-500 */
  --sh-nav-active: #34d399;                                      /* emerald-400 */
  --sh-nav-active-bg: color-mix(in oklab, #022c22 50%, transparent); /* emerald-950/50 */
  --sh-nav-active-line: color-mix(in oklab, #10b981 60%, transparent); /* emerald-500/60 */
  --sh-scrim: rgb(2 6 23 / 0.72);                                /* slate-950 @ 72 % */
  --sh-control-checked: #f8fafc;                                 /* = primary im Dark */
  --sh-control-checked-content: #0f172a;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --sh-border-strong: #475569;
    --sh-base-400: #334155;
    --sh-danger-solid: #ef4444;
    --sh-danger-solid-content: #ffffff;
    --sh-success-solid: #10b981;
    --sh-nav-active: #34d399;
    --sh-nav-active-bg: color-mix(in oklab, #022c22 50%, transparent);
    --sh-nav-active-line: color-mix(in oklab, #10b981 60%, transparent);
    --sh-scrim: rgb(2 6 23 / 0.72);
    --sh-control-checked: #f8fafc;
    --sh-control-checked-content: #0f172a;
  }
}

@theme inline {
  --font-sans: "Geist", system-ui, -apple-system, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --color-border-strong: var(--sh-border-strong);
  --color-base-400: var(--sh-base-400);
  --color-danger-solid: var(--sh-danger-solid);
  --color-danger-solid-content: var(--sh-danger-solid-content);
  --color-success-solid: var(--sh-success-solid);
  --color-nav-active: var(--sh-nav-active);
  --color-nav-active-bg: var(--sh-nav-active-bg);
  --color-nav-active-line: var(--sh-nav-active-line);
  --color-scrim: var(--sh-scrim);
  --color-control-checked: var(--sh-control-checked);
  --color-control-checked-content: var(--sh-control-checked-content);
}

@layer base {
  body {
    margin: 0;
    background: var(--color-base-100);
    color: var(--color-base-content);
  }
}

/* Lab-Formen global, damit die Rezepte in §7 unverändert bleiben */
@layer components {
  .btn { font-weight: 500; }                                     /* Medium statt Semibold */
  .btn:not(.btn-primary, .btn-secondary, .btn-accent, .btn-ghost, .btn-link, .btn-error, .btn-success, .btn-warning) {
    border-color: var(--color-border-strong);                    /* Default-Button = Outline */
  }
  .badge { border-radius: 9999px; }                              /* Badges sind Pills */
  .badge-soft { border-color: transparent; }                     /* farbige Badges ohne Rahmen */
}

/* Top-Ladebalken (indeterminate) bei laufender Navigation */
@keyframes app-progress { 0% { left: -35%; } 100% { left: 100%; } }
.app-progress {
  position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 50; overflow: hidden;
  background: color-mix(in oklab, var(--color-primary) 18%, transparent);
}
.app-progress::after {
  content: ""; position: absolute; top: 0; bottom: 0; width: 35%;
  border-radius: 0 3px 3px 0; background: var(--color-primary);
  animation: app-progress 0.9s ease-in-out infinite;
}

/* Kleiner Inline-Spinner (z. B. neben Nav-Link während Pending) */
@keyframes app-spin { to { transform: rotate(360deg); } }
.app-spinner {
  display: inline-block; width: 0.8rem; height: 0.8rem; flex-shrink: 0;
  border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 9999px; opacity: 0.7; animation: app-spin 0.6s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .app-progress::after, .app-spinner { animation: none; }
}
```

Fonts in `root.jsx` per `links()`:

```js
{ rel: "preconnect", href: "https://fonts.googleapis.com" },
{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" },
```

---

## 3. Dark / Light Mode umschalten

- Theme liegt als `data-theme="dark" | "light"` auf `<html>`.
- Kein Attribut = System-Präferenz (`light` ist `default`, `dark` ist `prefersdark`).
  Soll Dark **immer** Default sein (unabhängig vom OS): `default: true` auf `dark` setzen,
  `prefersdark` entfernen und `light` auf `default: false`.
- Wahl in `localStorage["theme"]` speichern.
- **Flash vermeiden:** Inline-Script im `<head>` vor dem Stylesheet, das das Attribut setzt.

```jsx
// root.jsx – im <head>, vor <Links />
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
  }}
/>
```

```jsx
// components/ThemeToggle.jsx
import { useEffect, useState } from "react";

const SunIcon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/></svg>);
const MoonIcon = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>);

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setTheme(attr || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  };
  return (
    <button type="button" onClick={toggle} title={theme === "dark" ? "Light Mode" : "Dark Mode"}
      className="btn btn-ghost btn-sm btn-square text-base-content/60 hover:text-base-content">
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
```

Platz für den Toggle: unten in der Sidebar neben der E-Mail / dem Abmelden-Button.

---

## 4. Farb-Regeln (wichtig für beide Modes)

| Zweck | Klasse | Niemals |
|---|---|---|
| Seitenhintergrund | `bg-base-100` | `bg-black`, `bg-[#1c1b1b]` |
| Card / Panel / Dropdown / Input-Fläche | `bg-base-200` | `bg-neutral-800` o. ä. |
| Border | `border-base-300` | `border-gray-*` |
| Aktiver Tab / Hover auf Input | `bg-base-300` | — |
| Text primär | `text-base-content` | **`text-white`** |
| Text sekundär (Labels, Meta) | `text-base-content/60` | `text-gray-400` |
| Text tertiär (Platzhalter „—", Counts) | `text-base-content/50`, `/40`, `/30` | — |
| Hover-Fläche auf Zeilen/Nav | `bg-base-content/5`, `bg-base-content/[0.03]` | **`bg-white/5`** |
| Aktiver Nav-Eintrag | `border-nav-active-line bg-nav-active-bg text-nav-active` (Rezept §6) | **`bg-white/10 text-white`**, `bg-emerald-*` |
| Tag-Chip in Input | `bg-base-content/10` | `bg-white/10` |
| Hauptaktion | `btn btn-primary` (Dark: helle Fläche + dunkle Schrift · Light: Mint + schwarze Schrift) | — |
| Default-Button | `btn` (Outline in `border-strong`, siehe §2 `@layer components`) | eigene Border-Klassen |
| Gehobene Fläche (aktives Segmented-Item, aktiver Filter) | `bg-base-400`, `bg-base-400/50–60` | `bg-slate-700` |
| Leiser Rahmen (ghost-outline, IconButton, Pagination, Popover) | `border-base-400` | `border-[#334155]` |
| Destruktiv gefüllt | `bg-danger-solid text-danger-solid-content` | `btn-error` (falscher Rotton), `bg-red-500` |
| Progress-Fill erfüllt | `bg-success-solid` | `bg-success` (zu hell bei voller Deckkraft) |
| Akzent aktiv / positiv | `text-success`, `bg-success/20` (Dark = Emerald) | `text-emerald-*`, Hex |
| Sekundär-Akzent / Badge | `badge-secondary` (Lila, schwarze Schrift) – nur Plan-/Feature-Label | — |

**Primary und Lila nur als Fläche mit Kontrast-Schrift verwenden** (`btn-primary`, `badge-primary`,
`badge-secondary`). **Nicht** als reine Textfarbe auf `base-100/200` – Primary ist im Dark Mode fast weiß
und im Light Mode Mint, beides als Text unbrauchbar. Deshalb: `badge-soft` / `alert-soft` nur mit
`success | warning | error`, nie mit `primary | secondary`.

**Emerald ist der einzige Akzent im Dark Mode** – für aktiv (Navigation) und positiv (Success). Rot nur für
negativ/Fehler, Amber sparsam für Warnungen. Kein weiterer Akzent.

Status-Farben (`success`, `warning`, `error`) dürfen pro Mode abweichen — sie sind in den Themes
schon passend gesetzt. Einfach `badge-soft badge-success` etc. nutzen.

Chart-Farben (hart, in beiden Modes gleich):

```js
const C = { green: "#22c55e", red: "#ef4444", purple: "#8b7bf0", blue: "#60a5fa", amber: "#e0a34a", teal: "#2dd4bf", gray: "#64748b" };
```

- **Grün und Rot tragen ein Urteil** (besser/schlechter) und kommen deshalb nur in Charts vor, die eines zeigen dürfen –
  nie in Verteilungen. Kategorien bekommen der Reihe nach **blue · purple · teal · amber**.
- **`gray` (neu 01.10.)** ist reserviert für „Other · n groups" und „Unknown" – alles, was keine echte Kategorie ist.
  Ein neutraler Theme-Ton (`base-content/30`) ginge nicht: Chart-Farben müssen in beiden Themes gleich bleiben.

Logo: Sectionheroes-Logo als weißes PNG existiert nur für Dark. Für Light eine dunkle Variante
hinterlegen und per `[data-theme=light]` / `dark:`-Äquivalent tauschen (z. B. zwei `<img>` mit
`hidden`-Toggle über `[data-theme="light"] .logo-dark { display:none }`).

---

## 5. Typografie & Maße

- Basis: `text-sm` (14px) für fast alles; `text-xs` (12px) für Meta/Labels; `text-[11px] uppercase tracking-wider text-base-content/50` für Card-Titel. **Sidebar-Gruppen sind 12px** (`text-xs font-medium uppercase tracking-wider text-base-content/60`) – so zeichnet Figma sie, und neben den 14px-Nav-Einträgen trägt 11px zu wenig.
- Seitentitel: `text-2xl font-semibold`. Section-Titel in Forms: `text-base font-semibold`. Login-Card: `text-lg font-semibold`.
- KPI-Wert: `text-xl font-semibold`, Zahlen mit `tabular-nums`.
- Schrift: Geist (`font-sans`); Keys, IDs, Datumswerte, E-Mail-Adressen in `font-mono` (Geist Mono).
- Radius: Inputs/Buttons `rounded-lg` (8px), aktiver Nav-Eintrag `rounded-r-lg` (links eckig, an der Linie),
  Tabs innen `rounded-md`, Cards/Tabellen/Dropdowns `rounded-box` (12px), Badges `rounded-full` (Pill).
- Schatten nur für schwebende Elemente: Dropdowns `shadow-lg`, DateRange-Popover `shadow-xl`, Tooltip-Popover `shadow-lg`, Modal `shadow-xl` (plus Scrim, §7 „Modal"). Cards **kein** Schatten, nur `border border-base-300`.
- Content-Padding: `main` = `px-10 py-8`. Cards `p-4` (Dashboard) bzw. `p-5` (Formulare). Grid-Gaps `gap-4`.
- Transitions: `transition-colors` auf allem Klickbaren.

---

## 6. Layout-Shell

```jsx
<div className="flex min-h-screen bg-base-100 font-sans text-base-content">
  {busy && <div className="app-progress" aria-hidden="true" />}

  <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-base-300 px-4 py-5">
    <div className="px-2 pb-5">{/* Logo, h-6 */}</div>

    <nav className="flex-1 overflow-y-auto">
      {/* pro Gruppe: */}
      <div className="mb-4">
        <div className="px-2 pb-1.5 text-[11px] uppercase tracking-wider text-base-content/60">Gruppe</div>
        <NavLink to="/x" prefetch="intent"
          className={({ isActive, isPending }) =>
            "mb-0.5 flex items-center justify-between gap-2 rounded-r-lg border-l-2 py-2 pl-2 pr-2.5 text-sm transition-colors " +
            (isActive ? "border-nav-active-line bg-nav-active-bg font-medium text-nav-active"
              : isPending ? "border-transparent bg-base-content/5 text-base-content"
              : "border-transparent hover:bg-base-content/5")}>
          {/* border-l-2 an jedem Eintrag, damit der Text beim Aktivieren nicht springt; links eckig, rechts rund */}
          {({ isPending }) => (<>
            <span>Label</span>
            <span className="flex items-center gap-1.5">
              {/* optional: */}<span className="badge badge-ghost badge-xs uppercase tracking-wide">Beta</span>
              {/* Counter: */}<span className="badge badge-primary badge-xs">3</span>
              {isPending && <span className="app-spinner" aria-hidden="true" />}
            </span>
          </>)}
        </NavLink>
        {/* Unterpunkt (eingerückt, nur sichtbar wenn Bereich aktiv): */}
        {/* className: "... ml-3 pl-3.5 pr-2.5 text-xs text-base-content/60" statt "px-2.5 text-sm" */}
      </div>
    </nav>

    <div className="border-t border-base-300 pt-3">
      <div className="truncate px-0.5 pb-2 font-mono text-xs text-base-content/60">user@mail.de</div>
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost btn-sm flex-1 border-base-300 font-medium text-base-content/60 hover:text-base-content">Abmelden</button>
        <ThemeToggle />
      </div>
    </div>
  </aside>

  <main className="flex-1 overflow-x-hidden px-10 py-8">{children}</main>
</div>
```

Die Shell wird auch von der `ErrorBoundary` gerendert, damit die Navigation bei Fehlern klickbar bleibt.

---

## 7. Komponenten-Rezepte (exakte Klassen)

### Page-Header
```jsx
<header className="mb-5 flex flex-wrap items-center justify-between gap-4">
  <h1 className="text-2xl font-semibold">Titel</h1>
  <div className="flex flex-wrap items-center gap-2">{/* Actions rechts */}</div>
</header>
```

### Card
```jsx
function Card({ title, action, children, className = "" }) {
  return (
    <section className={"flex flex-col rounded-box border border-base-300 bg-base-200 p-4 " + className}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <div className="text-[11px] uppercase tracking-wider text-base-content/50">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
```
Detail-Seiten-Variante: Titel als `text-sm font-semibold uppercase tracking-wider text-base-content/60`.

### KPI-Kachel (innerhalb einer Card, Grid `grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`)
```jsx
<div className="min-w-0 rounded-lg bg-base-100/40 p-3">              {/* als Link: + "transition-colors hover:bg-base-100/70 hover:ring-1 hover:ring-primary/40" */}
  <div className="flex items-center justify-between text-xs text-base-content/60">MRR <span className="text-base-content/30">›</span></div>
  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
    <span className="truncate text-xl font-semibold">12.340 €</span>
    <span className="text-xs text-success">+4,2 %</span>                {/* Delta: text-success / text-error */}
  </div>
  <div className="mt-2">{/* Sparkline SVG, h-8 */}</div>
</div>
```
Einfacher Stat ohne Kachel: Label `text-xs text-base-content/60`, Wert `mt-0.5 truncate text-xl font-semibold`, Sub `mt-0.5 text-xs text-base-content/50`.

### Tabelle
```jsx
<div className="overflow-x-auto rounded-box border border-base-300 bg-base-200">
  <table className="table table-sm">
    <thead><tr>
      <th className="cursor-pointer select-none whitespace-nowrap">Name {sorted && <span className="ml-1 text-base-content/50">▲</span>}</th>
      <th className="text-right ...">Betrag</th>
    </tr></thead>
    <tbody>
      <tr className="cursor-pointer hover:bg-base-content/[0.03]" onClick={...}>
        <td className="align-top">…</td>
        <td className="text-right align-top tabular-nums">…</td>
      </tr>
      {/* Empty: */}
      <tr><td colSpan={n} className="py-9 text-center text-base-content/60">Keine Einträge.</td></tr>
    </tbody>
  </table>
</div>
{/* Footer: */}
<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
  <p className="text-xs text-base-content/50">1–20 von 134 Einträgen</p>
  <div className="join">
    <button className="btn btn-sm join-item" disabled>«</button>
    <span className="btn btn-sm join-item pointer-events-none">Seite 1 / 7</span>
    <button className="btn btn-sm join-item">»</button>
  </div>
</div>
```
Zellen-Inhalte: Avatar/Favicon + `truncate font-medium` + Sub-Zeile `mt-0.5 block truncate text-xs text-base-content/60`. Leerwert: `<span className="text-base-content/30">—</span>`. Lade-Placeholder in Zelle: `<span className="inline-block h-3 w-10 animate-pulse rounded bg-base-300/60 align-middle" />`.

### Segmented Tabs (Status / Währung / Ansichten)
```jsx
const tabClass = (active) =>
  "rounded-md px-3 py-1 text-sm transition-colors " +
  (active ? "bg-base-300 font-medium text-base-content" : "text-base-content/60 hover:text-base-content");

<div className="flex flex-wrap items-center gap-1 rounded-lg bg-base-200 p-1">
  <button className={tabClass(true)}>Alle <span className="ml-1.5 text-xs text-base-content/40">134</span></button>
  <div className="mx-0.5 h-5 w-px bg-base-300" />  {/* Trenner */}
</div>
```

### Underline Tabs (Seiten-Tabs, z. B. Results: Overview · Goals · Devices · Visitors · Channels)
Figma: Komponente `Results / Tabs`, Property `Style=Underline` (die Segmented-Variante gibt es dort als `Style=Segmented`).
Die Tab-Leiste sitzt am unteren Rand des Seiten-Headers; die aktive Linie liegt auf dessen Border.
```jsx
const underlineTab = (active) =>
  "border-b-2 px-3.5 pt-1.5 pb-3 text-sm transition-colors " +
  (active ? "border-base-content/90 font-medium text-base-content"
          : "border-transparent text-base-content/60 hover:text-base-content");

<nav className="-mb-px flex items-end gap-1 overflow-x-auto">
  <a className={underlineTab(true)}>Overview</a>
  <a className={underlineTab(false)}>Goals <span className="ml-2 rounded-full bg-base-content/12 px-2 py-px text-xs font-medium text-base-content/80">3</span></a>
</nav>
```
Zähler neutral grau, nie farbig.

### Filter-Button + Filter-Chips
```jsx
<button className={"rounded-lg px-3 py-2 text-sm transition-colors " +
  (active ? "bg-base-300 font-medium text-base-content" : "bg-base-200 text-base-content hover:bg-base-300")}>
  Filter (2)
</button>
{/* Chips: */}
<span className="badge badge-sm gap-1 badge-outline">Tag <button className="text-base-content/50 hover:text-error">✕</button></span>
<span className="badge badge-sm gap-1 badge-primary badge-outline">MRR ≥ 100</span>
```

### Dropdown / Popover-Menü
```jsx
<div className="relative" ref={ref}>   {/* useClickOutside schließt */}
  <button className="btn btn-sm">Spalten</button>
  <ul className="menu absolute right-0 top-full z-20 mt-1.5 max-h-96 w-56 flex-nowrap overflow-y-auto rounded-box border border-base-300 bg-base-200 p-1.5 shadow-lg">
    <li><label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="checkbox checkbox-xs" /> <span className="truncate">Spalte</span></label></li>
  </ul>
</div>
```
Freies Panel (z. B. Filter): `absolute left-0 top-full z-20 mt-1.5 w-80 rounded-box border border-base-300 bg-base-200 p-3 shadow-lg`, Abschnitts-Label darin `mb-1.5 text-xs font-medium text-base-content/60`.

### SearchInput (Pill-Stil)
```jsx
<div className="relative ml-auto w-full max-w-xs">
  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40">{/* Lupe 15px */}</span>
  <input type="search" placeholder="Suchen"
    className="w-full rounded-lg bg-base-200 py-2 pl-9 pr-3 text-sm text-base-content outline-none transition-colors placeholder:text-base-content/40 hover:bg-base-300 focus:bg-base-300" />
</div>
```

### DateRange-/Dropdown-Trigger (gleicher Pill-Stil)
```jsx
<button className="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-300">
  <span className="text-base-content/50">{/* Kalender-Icon */}</span> Letzte 30 Tage
</button>
{/* Popover: */}
<div className="absolute right-0 top-full z-30 mt-1 flex overflow-hidden rounded-box border border-base-300 bg-base-200 shadow-xl">
  <div className="flex min-w-[140px] flex-col p-1.5">
    <button className={"rounded-md px-3 py-1.5 text-left text-sm transition-colors " + (active ? "bg-base-300 font-medium text-base-content" : "text-base-content/70 hover:bg-base-100")}>Preset</button>
  </div>
  <div className="w-56 border-l border-base-300 p-3">
    <div className="mb-2 text-[11px] uppercase tracking-wider text-base-content/50">Eigener Zeitraum</div>
    <label className="mb-2 flex flex-col gap-1 text-xs text-base-content/60">Von <input type="date" className="input input-sm w-full" /></label>
  </div>
</div>
```

### Buttons
**Komponente: `app/components/Button.tsx`** (Figma `Button` 109:149). Seit 01.10. **sieben** Stile statt fünf;
`ghost-outline`, `danger-soft` und `danger-text` sind neu. Alle in `/dashboard/styleguide` nachzusehen.

Die Klassen stehen ausgeschrieben in der Komponente statt auf daisyUIs `btn-*` aufzusetzen: vier der sieben haben
kein daisyUI-Gegenstück, und eine halb-daisyUI/halb-eigene Mischung wäre das Schlechteste von beidem. Radius 8px,
`font-medium`, keine Pills.

| Stil | Fläche | Rahmen | Schrift |
|---|---|---|---|
| `primary` | `bg-primary` | – | `text-primary-content` (Dark: helle Fläche, dunkle Schrift) |
| `secondary` | `bg-base-200/50` | `border-border-strong` | `text-base-content/90` |
| `ghost` | – | – | `text-base-content/80` |
| `ghost-outline` | – | `border-base-400` | `text-base-content/80` |
| `danger` | `bg-danger-solid` | – | `text-danger-solid-content` |
| `danger-soft` | `bg-danger-solid/10` | `border-error/50` | `text-error` |
| `danger-text` | – | – | `text-error` |

Größen: `sm` = `px-3 py-[7px] text-[13px]` (Icon 14px) · `md` = `px-4 py-[9px] text-sm` (Icon 16px) ·
`lg` = `px-4 py-[11px] text-[15px]`. `icon` und `trailingIcon` nehmen ein beliebiges Icon aus §7 „Icons".

- **Icon-Only:** `IconButton` aus derselben Datei (Figma 109:158) – quadratisch, `border-base-400`, 28px (`sm`) oder
  32px (`md`). `label` ist Pflicht; ein Icon-Button ohne zugänglichen Namen ist mit Screenreader unbenutzbar.
- Textlink: `hover:underline`; Löschen-X in Listen: `text-base-content/30 hover:text-error`.

### Tooltip (gestyltes Popover)
**Komponente: `app/components/Tooltip.tsx`** (Figma `TooltipTrigger` 109:159 und **`Tooltip/Popover`** mit
`kind=simple|rich`, seit 01.10. auf Foundations). **Vom Designer bestätigt (01.10.):** Fläche `base-300` mit Rand
`base-400` bleibt – das Popover öffnet über Cards (`base-200`) und muss eine Stufe darüber liegen. Figma hatte für den
Stopp-Regel-Tooltip noch `base-200` gezeichnet; das ist jetzt an den Code angeglichen.

**Zweite Variante `rich`** – nur für den Stopp-Regel-Tooltip an „Not yet conclusive": `w-80 p-4`, Titel
`text-[13px] font-medium text-base-content`, ein Satz Erklärung (`text-xs /80`), die drei Bedingungen untereinander
(Ring-Icon 14px, Bedingung `text-xs`, Stand darunter `text-xs /60`), Trenner `border-base-400`, letzte Zeile die
**Planwerte** `text-[11px] /50` („Planned for a lift of about 12,4 % on a 2,4 % baseline · α 0,05 · power 80 %").
Das ist der Ort, an den ADR-0037 die Planwerte schickt. Der Inhalt kommt weiter aus dem Glossar plus den
`evaluate()`-Zahlen; `text` nimmt dafür einen `ReactNode`.

**Korrektur am Beispieltext im Styleguide:** „Converting visitors. A visitor with three orders converts once
(contract 4.8)." – „contract 4.8" ist interner Jargon und hat in einem Glossartext nichts zu suchen (§10). Vorschlag:
„Visitors who bought at least once. A visitor with three orders counts as one conversion."

Ersetzt das frühere `title`-Attribut: das ließ sich nicht stylen, erschien verzögert und funktionierte auf Touch gar
nicht. Die Results-Seite trägt nach §10 rund zehn Glossar-Tooltips – ohne Popover nicht umsetzbar.

```jsx
<span>Conversions <Tooltip text={glossary.conversions} /></span>
```
- Trigger: `size-4 rounded-full bg-base-content/10 text-[10px] font-semibold text-base-content/60`, Glyph „?"
- Popover: `w-64 rounded-lg border border-base-400 bg-base-300 px-3 py-2 text-xs leading-relaxed text-base-content/90 shadow-lg`
- Öffnet auf **Hover, Fokus und Klick** – Maus, Tastatur und Touch kommen alle dran. Escape schließt und gibt den
  Fokus zurück, Klick außerhalb schließt (§8). `aria-describedby` verbindet Text und Trigger.
- **Der Text kommt immer aus dem Glossar-Modul** (plan WP5a), nie inline im JSX – sonst driftet derselbe Begriff
  zwischen den Seiten auseinander. Welche Begriffe überhaupt einen bekommen, steht in §10.

### Progress (Stopp-Regel)
**Komponente: `app/components/Progress.tsx`** (Figma 109:165). Der Fortschrittsbalken der Stopp-Regel aus ADR-0036,
gemessen am **kleineren Arm**.

- Track `h-1.5 rounded-full bg-base-300`, Fill `bg-success-solid` (erfüllt) bzw. `bg-border-strong` (neutral)
- **Neutral, solange die Regel nicht erfüllt ist** – Farbe ist eine Wertung (§10, ADR-0037)
- Die Komponente bringt **keine eigene Breite** mit: eine Breitenklasse hier würde mit der des Aufrufers kollidieren
  und Tailwind entscheidet das nach Quellreihenfolge, nicht nach der Reihenfolge im String

### Tabellenzellen (Performance-Tabelle)
**Komponente: `app/components/Table.tsx`** (Figma `Table/HeadCell` 110:137, `Table/Cell` 110:162). Die
Gesamttabelle auf Results-Overview und die Tabellen der Segment-Tabs sind **dieselbe Komponente** (ADR-0037).

- `primary` = die hervorgehobene Primärmetrik-Spalte: Kopf `bg-base-300/50`, Zelle `bg-base-300/35`, dazu `star`
  im Kopf. Hervorhebung über **Größe und Fläche, nie über Zusatztext** (§10)
- `kind="metric"` = der große Wert, `text-lg font-semibold tabular-nums`
- `sub` = die Zeile darunter, auf Results der Lift („+11,6 % vs A"). Sie bleibt **neutral grau**; es gibt bewusst
  keinen `tone`-Prop, der sie grün färben könnte
- `TableFrame` bringt den horizontalen Scroll **im eigenen Container** mit – die Seite scrollt nie seitwärts

### Chip · Pagination · Segmented · Dropdown-Trigger · SearchInput
**Komponenten: `app/components/Controls.tsx`** (Figma 109:173 · 109:174 · 110:116 · 110:71 · 110:72).

- **Chip** `rounded-md bg-base-300 py-0.5 pl-2 pr-1.5 text-xs` mit ✕; **AddChip** `border-border-strong` für
  „+ Add day". Das ist der Tainted-Days-Editor in der Checks-Liste (ADR-0037)
- **Pagination** `rounded-lg border border-base-400`, drei Segmente mit `border-x` dazwischen
- **Segmented** Container `rounded-lg bg-base-300/60 p-[3px]`, aktives Item `rounded-md bg-base-400 font-medium`
- **DropdownTrigger** inaktiv wie `secondary`; **aktiv** `border-base-content/60 bg-base-400/50` plus ✕ zum Leeren –
  auf Results heißt aktiv „Explore-Modus" (ADR-0034)
- **SearchInput** `rounded-lg bg-base-300/60 py-2 pl-9 pr-3` mit Lupe links

### ShopSwitcher
**Komponente: `app/components/ShopSwitcher.tsx`** (Figma 105:440 / 110:163). **Nur Darstellung** – welcher Kontext
daran hängt und ob der Shop in die URL wandert, ist in STATUS.md offen und braucht erst ein ADR.
Die Favicon-Farbe wird aus der Domain abgeleitet, nicht gespeichert – eine `Shop.color`-Spalte für eine Dekoration
wäre die falsche Art von dauerhaft.

### Formularfelder (Checkbox · Radio · Input)
**Komponente: `app/components/Form.tsx`** (Figma 8:94 · 8:102 · 8:123). **Vom Designer geprüft (01.10.)** – in Figma
nicht mehr „veraltet", sondern aktuell (Beschreibung an den Komponenten). Die zwei Korrekturen sind seit 02.10. im
Code:

- **Input liegt vertieft**: `bg-base-100` statt `bg-base-200`. Auf einer Card (`base-200`) verschwindet ein
  `base-200`-Feld sonst bis auf den Rand; alle Formulare in Figma (Experiment form, Stop-Dialog) zeichnen es so.
  Rand `border-base-content/20` (≈ `border-strong`, darf so bleiben), Höhe **40 px** (`md`, `h-10`) bzw. 32 px
  (`sm`, `h-8`). Dasselbe gilt für **Textarea** und **Select**; die Textarea wächst mit dem Inhalt und hat deshalb
  keine feste Höhe.
- **Gesetzte Checkbox / gesetztes Radio** über das Token `control-checked` (§2) statt `primary`. Im Dark Mode
  ändert sich nichts (= primary); im Light Mode ist Mint-auf-Weiß als „an" kaum von „aus" zu unterscheiden.
- Checkbox, Radio und `locked` stimmen sonst mit Figma überein.

`locked` ist der Zustand aus Vertrag 4.6 (Targeting, Allocation, Weights, Salt bei `RUNNING` gesperrt): gerendert als
disabled mit Schloss und Erklärung. Die eigentliche Sperre liegt im Service-Layer, nicht in einer CSS-Klasse.

**Fehlertexte für Laien:** Allocation ist im UI ein Prozentwert, der Text muss es auch sein („… has to be between
1 and 100 %"), Zahlen in Feldern `de-DE` („1.000", nicht „1000"). Beides ist im Styleguide korrigiert.

**MobileTopBar** (Figma 8:249, bestätigt 01.10., im Code seit 02.10.): Logo + Wortmarke links, Menü-Button rechts,
**kein Seitentitel** – der steht direkt darunter im Page-Header. `h-14 border-b border-base-300 bg-base-100 px-4`,
die Wortmarke kommt als `Wordmark` aus `Shell.tsx`, damit Sidebar und Mobile-Bar nicht auseinanderlaufen.

### Icons
**`app/components/icons.tsx`** – 36 Icons, Inline-SVG, 24er-Viewbox, `stroke="currentColor"`, `strokeWidth={2}`,
gerendert mit 15–16px (§1). Die Pfade sind aus **Lucide** übernommen (ISC), womit auch die Figma-Icons gezeichnet
wurden. **Keine Icon-Library als Abhängigkeit** (§1) und **nie** `<img>` auf eine Figma-Asset-URL – die laufen nach
sieben Tagen ab und sind flachgerechnete Outlines, die kein `currentColor` annehmen.

### Badges
**Komponente: `app/components/Badge.tsx`** (Figma 109:64) – sechs Tones: `neutral` · `success` · `warning` ·
`error` · `info` · `draft` (gestrichelt), optional mit Dot. Zuordnung: running = `success` + Dot · paused =
`warning` · draft = `draft` · ended = `info` · Fehler = `error` · alles andere `neutral`. Dazu **VariantKey**
(Figma 115:1395), die A/B/C-Box vor einem Variantennamen.

Die daisyUI-`badge-*`-Klassen unten gelten weiter für die Stellen, die sie schon nutzen.
Alle Badges sind Pills (`rounded-full`, global in §2); `badge-soft` hat keinen Rahmen.
- Status: `badge badge-sm badge-soft badge-success` (aktiv) · `badge-soft badge-warning` (eingefroren/pausiert) · `badge-soft badge-error` · `badge-ghost` (inaktiv / neutral)
- Tags: `badge badge-sm badge-outline`
- Counter in Nav: `badge badge-primary badge-xs`
- Plan-/Feature-Label: `badge badge-secondary badge-sm` (Lila)
- Hinweis („deinstalliert"): `badge badge-xs badge-ghost shrink-0 text-base-content/50`
- Beta-Tag: `badge badge-ghost badge-xs uppercase tracking-wide`
- Mini-Feature-Kachel (S/M/U/B): `inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold` + `bg-primary/20 text-primary` (an) / `bg-base-300/40 text-base-content/25` (aus). Im Light Mode `text-primary` → `text-base-content` verwenden.

### Formulare
```jsx
<form>
  {/* Unsaved-Changes-Bar (sticky, erscheint nur bei dirty || saving) */}
  <div className="sticky top-3 z-10 mb-4 flex items-center justify-between gap-3 rounded-box border border-base-300 bg-neutral px-3.5 py-2.5 text-sm font-medium text-neutral-content shadow-lg">
    <span>Unsaved changes</span>
    <div className="flex gap-2">
      <button type="button" className="btn btn-sm">Discard</button>
      <button type="submit" className="btn btn-primary btn-sm">Save</button>
    </div>
  </div>

  <section className="card mb-4 border border-base-300 bg-base-200 p-5">
    <h2 className="mb-4 text-base font-semibold">General</h2>

    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-sm text-base-content/60">Name <Tooltip text="…" /></span>
      <input type="text" className="input w-full" placeholder="e.g. …" />
      <p className="mt-1.5 text-xs text-error">Fehlertext</p>
    </label>

    <fieldset className="mb-3.5">
      <legend className="pb-1.5 text-sm text-base-content/60">Benefit</legend>
      <div className="mb-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="radio" className="radio radio-primary radio-xs" /> <span>Percentage discount</span>
        </label>
        {/* abhängiges Inline-Feld: */}
        <div className="mt-2 mb-1 ml-6 max-w-[340px] flex items-center gap-2">
          <input type="number" className="input input-sm w-28" />
          <span className="whitespace-nowrap text-sm text-base-content/60">%</span>
        </div>
      </div>
    </fieldset>
  </section>
</form>
```
- Checkbox: `checkbox checkbox-primary checkbox-xs` (gleiches Label-Muster wie Radio)
- Select: `select select-sm w-full` / `select-xs` in Popovers
- Tooltip-„?": `<Tooltip text={glossary.key} />` – Rezept oben, **nicht** mehr das native `title`
- Tag-Input: Wrapper `flex flex-wrap gap-1.5 rounded-lg border border-base-300 bg-base-100 p-1.5`, Chips `badge badge-sm gap-1 border-0 bg-base-content/10`, Input `min-w-32 flex-1 border-0 bg-transparent px-1.5 py-1 text-sm outline-none`

### Alerts (Feedback nach Action)
```jsx
<div role="alert" className="alert alert-success alert-soft mb-4 text-sm">Gespeichert.</div>
<div role="alert" className="alert alert-error alert-soft mb-4 text-sm">Fehler …</div>
```

### Skeletons (Loading)
```jsx
const Bar = ({ w = "100%", h = 12 }) => <span className="block animate-pulse rounded bg-base-300" style={{ width: w, height: h }} />;
// KPI-Skeleton: gleiche Grid + Kachel wie KPI, darin Bar 50%/9, Bar 72%/18, Bar 100%/26
// Chart-Skeleton: <div className="h-[210px] animate-pulse rounded-lg bg-base-300/30" />
// Tabellen-Skeleton: Zeilen mit "flex items-center justify-between gap-4" und Bars 42%/22%/14%
```

### Collapsible Section
```jsx
<section className="rounded-box border border-base-300 bg-base-200">
  <div onClick={toggle} className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 transition-colors hover:bg-base-300/30">
    <div className="flex items-center gap-2"><Chevron open={open} /> <span className="font-medium">Titel</span> <span className="text-xs text-base-content/50">Meta</span></div>
    {headerRight}
  </div>
  {open && <div className="border-t border-base-300 p-4">…</div>}
</section>
```
Chevron: 16px SVG `m9 6 6 6-6 6`, `shrink-0 text-base-content/40 transition-transform duration-200` + `rotate-90` wenn offen.

### Key-Value-Zeile (Detailseiten)
```jsx
<div className="flex items-baseline justify-between gap-4 py-1 text-sm">
  <span className="text-base-content/60">Label</span>
  <span className="text-right font-medium">Wert</span>
</div>
```

### Chart-Tooltip & Legende
- Tooltip: `pointer-events-none absolute top-1 z-10 rounded-lg border border-base-300 bg-base-100 px-2.5 py-1.5 text-[11px] shadow-lg`
- Legende: `flex items-center gap-1.5 text-xs text-base-content/60` mit Punkt `inline-block h-2 w-2 rounded-full` (inline `background`)
- Achsen-Labels im SVG: `fill-current text-[10px] opacity-50`
- Area-Fill: Gradient von `stopOpacity 0.28` → `0`, Linie `strokeWidth 1.8`

### Donut (Distribution)
Figma: `Chart/Donut` (state = default · hover · empty · single), `Chart/LegendItem` (default · active · dimmed),
`Chart/DonutBlock` (layout = vertical · horizontal, state = default · empty), Spec-Tafel „Donut · spec" auf
Foundations. Verwendung: Results-Overview dreimal nebeneinander (Device · Visitor type · Channel), je einmal auf den
Tabs Devices, Visitors, Channels (plan WP5b, Vertrag 4.10).

**Gezeichnet werden Visitors, nie Orders.** Handgeschriebenes SVG (§1), keine Library.

- **Maße:** 104 × 104 px, Ring 14 px (Innenradius 38 von 52), 2° Lücke zwischen Segmenten (in der Kartenfarbe, also
  einfach ausgelassen), keine Lücke bei nur einem Segment. Start bei 12 Uhr, im Uhrzeigersinn, **größtes Segment
  zuerst**, „Other" bzw. „Unknown" **immer zuletzt**.
- **2 bis 5 Segmente.** Channel: Top 4 + „Other · n groups" (volle Liste in der Tabelle, 4.10). Device: mobile ·
  desktop · tablet, **nie `unknown`** – Visitors sind nie unknown; in der Devices-Tabelle bleibt `unknown` als vierter
  Bucket. Visitor type: new · returning · unknown (unknown = altes Snippet, das gibt es bei Visitors).
- **Farben** aus der Chart-Palette (§4), in beiden Themes gleich: der Reihe nach blue · purple · teal · amber, `gray`
  nur für Other/Unknown. Nie Grün/Rot. Leerer Ring (`empty`): `base-300`.
- **Sichtbar ist Prozent, nicht die absolute Zahl.** Der Donut beantwortet „wie verteilt sich der Traffic" – das ist
  eine Anteilsfrage, und die absoluten Zahlen je Segment stehen ohnehin in der Tabelle des jeweiligen Tabs.
  Prozent als Ganzzahl, nach Largest-Remainder gerundet (die Legende summiert sich immer auf 100), unter 0,5 „<1 %".
- **Mitte:** die **Gesamtzahl** der Visitors (`text-[15px] font-semibold tabular-nums`, darunter „visitors"
  `text-[11px] /50`). Sie ist die einzige absolute Zahl am Donut und gibt den Prozenten ihren Maßstab – keine
  Doppelangabe, weil sie nirgends daneben noch einmal steht.
- **Hover / Tap** auf ein Segment **oder** eine Legendenzeile: das Segment bleibt voll, die anderen gehen auf 30 %;
  die Mitte zeigt **die absolute Zahl dieses Segments** und seinen Namen statt der Gesamtzahl; die Legendenzeile wird
  `font-medium text-base-content`, die anderen `/40`. Das ist das „andere im Hover" aus §10. Tap außerhalb setzt
  zurück; kein separater Chart-Tooltip.
- **Legende:** Zeile 20 px + 4 px Abstand, Punkt 8 px, Label `text-xs /80`, Wert rechtsbündig `text-xs tabular-nums
  /60`.
- **Block-Abstände** (vertical): Titel (`text-sm font-medium`) → Donut 16 · Donut → Legende 16 · Legende → Link 8;
  drei Blöcke nebeneinander mit `gap-6`. **horizontal** (mobil und auf den Segment-Tabs): Donut links, rechts Titel,
  Legende, Link; Abstand 20, Blöcke untereinander mit 24.
- **Leer** („No data yet"): leerer Ring, „—" in der Mitte, statt der Legende eine Zeile „No data yet"
  (`text-xs /50`), kein Link.
- **Ein Segment:** voller Ring ohne Lücke, eine Legendenzeile „100 %" (z. B. Targeting nur Mobile).
- **Keine Erklärzeile** unter dem Donut (§10). Tooltip am Titel nur bei Visitor type und Channel (Glossar).
- Zugänglichkeit: `role="img"` mit `aria-label` aus der Legende („Mobile 70 %, Desktop 26 %, Tablet 4 %"); die
  Legende selbst ist echter Text.

### Modal
Figma: `Modal/Header`, `Modal/Footer` (layout = inline · stacked, tone = default · destructive, state = idle · busy),
`Modal/Callout` (neutral · warning), `RadioCard`, `Field/Label`, `Textarea`, `Modal/Handle`, `Modal/Scrim`,
`Icon/spinner` auf Foundations; Rezept-Tafel „Modal · recipe". Die vier Results-Dialoge (Start · Pause · Stop with
verdict · Stop early) plus Busy und langer Body sind daraus gebaut (Figma: Results → Dialogs). Später auch „Add goal".

Basis ist das native `<dialog>` mit `showModal()` (Fokusfalle, Escape, Top-Layer, Rest der Seite inert) – keine
Library (§9). daisyUIs `modal` darf die Hülle stellen (`modal modal-bottom sm:modal-middle`), die Box ist unsere.

```jsx
<dialog className="modal modal-bottom sm:modal-middle bg-scrim">
  <div className="modal-box flex max-h-[calc(100vh-64px)] w-full max-w-[480px] flex-col overflow-hidden rounded-box
                  border border-base-300 bg-base-200 p-0 shadow-xl sm:max-w-[480px]">  {/* md: 560 */}
    <header className="flex items-center gap-3 px-6 pt-5 pb-1">
      <h2 className="flex-1 text-base font-semibold">Stop experiment?</h2>
      <IconButton icon="x" label="Close" />                    {/* weg, solange busy */}
    </header>
    <div className="flex-1 space-y-4 overflow-y-auto px-6 pt-3 pb-2">{/* Callout · Felder · Callout */}</div>
    <footer className="flex justify-end gap-2 px-6 pt-4 pb-5">
      <Button style="ghost">Cancel</Button>
      <Button style="danger">Stop and freeze result</Button>
    </footer>
  </div>
</dialog>
```

- **Breiten:** `sm` 480 px – Bestätigung mit Text und höchstens einem Callout (Start, Pause). `md` 560 px – sobald ein
  Formular drin ist (Stop with verdict, Stop early, Add goal).
- **Höhe:** höchstens Viewport − 64 px. Header und Footer bleiben stehen, **nur der Body scrollt**. Die Haarlinien
  unter dem Header und über dem Footer (`border-base-300`) erscheinen nur, solange es etwas zu scrollen gibt.
- **Scrim** `bg-scrim` (Token §2, dunkelt in beiden Themes ab). **Schatten `shadow-xl`** auf der Box – dieselbe Stufe
  wie das DateRange-Popover; die Trennung von der Seite leistet der Scrim, ein noch tieferer Schatten bringt nichts.
- **Reihenfolge im Body:** Warn-Callout (falls vorhanden) zuerst → Felder → neutraler Konsequenz-Callout (Schloss)
  zuletzt. Abstand Label → Feld 8, zwischen Blöcken 16.
- **Formular im Body:** `Field/Label` (`text-sm /80`, „required" `text-xs /40`) über dem Feld. Die Entscheidung im
  Stop-Dialog ist eine Gruppe **`RadioCard`s**, kein Select – jede Option braucht ihre Erklärzeile, und nicht
  erlaubte Optionen (Winner vor erfüllter Regel) bleiben **sichtbar, aber disabled**, damit der Grund lesbar ist.
  `conclusion` ist eine `Textarea` (88 px, wächst bis 6 Zeilen). Beides Pflicht; der Hauptbutton bleibt aktiv und
  zeigt beim Absenden die Inline-Fehler (§8), statt stumm ausgegraut zu sein.
- **Aktionen:** Cancel (`ghost`) links neben der Hauptaktion, rechtsbündig. Destruktiv = `danger`-Button, dessen
  Label die Folge nennt („Stop and freeze result", „Stop anyway").
- **Zustände:** *Standard* · *mit Warnung* – Warn-Callout oben, **blockiert nie**, darf eine sanftere Alternative als
  Textaktion anbieten („Pause instead") · *destruktiv* – `danger` als Hauptaktion · *busy* – Spinner (`.app-spinner`)
  plus „Stopping…", Cancel disabled, ✕ weg, Body `inert` und 60 %, Escape und Scrim-Klick wirkungslos · *Fehler* –
  `alert-soft alert-error` oben im Body, alles wieder aktiv.
- **Schließen:** ✕, Escape und Klick auf den Scrim = Cancel. **Ausnahmen:** während busy gar nicht; sobald ein Feld
  Eingaben hat, nur noch über ✕/Cancel (ein verirrter Klick daneben verwirft sonst die getippte Conclusion).
- **Fokus:** auf das erste Feld; ohne Feld bei destruktiven Dialogen auf **Cancel**, sonst auf die Hauptaktion. Beim
  Schließen zurück auf den Auslöser.
- **Unter 640 px ist jedes Modal ein Bottom Sheet** – nicht nur Stop early. Volle Breite, oben `rounded-t-box`,
  `Modal/Handle` (36 × 4, Wischen nach unten = Cancel), **kein ✕**, Footer gestapelt (Hauptaktion oben, volle Breite,
  Cancel darunter), höchstens 90 vh, Body scrollt. Begründung: eine Regel statt einer Ausnahme; die Formulare
  (Textarea + Tastatur) brauchen die Höhe; Daumen erreichen den unteren Rand, nicht die Mitte; und ein 480er-Modal
  wäre auf 390 px ohnehin randlos – dann besser gleich als Sheet.

### Login
```jsx
<div className="flex min-h-screen items-center justify-center bg-base-100 font-sans text-base-content">
  <div className="card w-[340px] border border-base-300 bg-base-200 p-7">
    <h1 className="text-lg font-semibold">Titel</h1>
    <p className="mt-1 mb-5 text-sm text-base-content/60">Untertitel</p>
    <button className="btn btn-primary btn-block">Mit Google anmelden</button>
  </div>
</div>
```

### Fehlerseite (innerhalb der Shell)
`h1 text-2xl font-semibold` + `p text-base-content/60` + Detail-Block
`mt-4 max-w-full overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3 text-xs text-base-content/70`.

---

## 8. Verhalten / UX-Konventionen

- Jede Navigation zeigt den Top-Ladebalken (`useNavigation().state !== "idle"`); Nav-Links mit `prefetch="intent"` und Pending-Spinner.
- Teure Daten (Umsätze, Charts) werden **deferred** per `useFetcher` aus Resource-Routes nachgeladen; bis dahin Skeleton/Pulse-Placeholder, nie leere Fläche.
- Listen: clientseitig filtern/sortieren/paginieren (20 pro Seite), Spalten-Sichtbarkeit und gespeicherte Ansichten in `localStorage` (nach Mount laden → keine Hydration-Mismatches).
- Dropdowns schließen bei Klick außerhalb (`mousedown`-Listener).
- Formulare: Unsaved-Bar erscheint sofort bei Änderung, „Discard" setzt auf Initialzustand zurück, Fehler inline unter dem Feld in `text-xs text-error`.
- Sprache der UI: Deutsch (Labels), Fachbegriffe englisch (MRR, Discounts, Save/Discard). Zahlen `de-DE`, Beträge `Intl.NumberFormat`.
- `prefers-reduced-motion`: Dekor-Animationen abschalten.

---

## 9. Do / Don't

**Do**
- Nur daisyUI-Semantik-Tokens (`base-*`, `primary`, `secondary`, `accent`, `neutral`, `success/warning/error`) und die
  eigenen Tokens aus §2 (`border-strong`, `base-400`, `danger-solid`, `success-solid`, `nav-active*`) +
  Opacity-Modifier (`/60`, `/40` …). Keine Tailwind-Paletten wie `slate-*` oder `emerald-*` in Klassen – die
  Slate/Emerald-Werte stecken nur im Theme.
- **Figma zeichnet rohe Hex-Werte, keine Variablen.** Beim Übertragen also nicht abschreiben, sondern auf ein Token
  abbilden; wo keins passt, in §2 eins **anlegen**. Für die Grautöne gilt die Tabelle in §4: `#e2e8f0` ≈
  `text-base-content/90`, `#cbd5e1` ≈ `/80`, `#94a3b8` ≈ `/60`, `#64748b` ≈ `/40`. Der Opacity-Weg verliert etwas
  vom Blaustich der Slate-Werte – das ist der Preis des Tokensystems und ausdrücklich so gewollt.
- Cards flach: Border, kein Schatten. Schatten nur für Popovers.
- Kompakt: `btn-sm`, `table-sm`, `input-sm` in Bars; Standardgröße nur in Formularen.
- Icons als Inline-SVG, `currentColor`, 15–16px, in `text-base-content/40–50`.

**Don't**
- Kein `text-white`, `bg-white/*`, `bg-black`, `text-gray-*`, keine Hex-Farben in Klassen (Ausnahme: Chart-Farben via `style`).
- Kein `badge-soft` / `alert-soft` mit `primary` oder `secondary`.
- Keine `shadow-*` auf Cards, keine `rounded-full` Buttons, keine Gradienten (außer bewusst als AI-Feature-Button).
- Keine zusätzlichen UI-Libraries (Polaris, shadcn, Radix, MUI, Headless UI).

---

## 10. Content-Regeln (Joel, 27.09.2026 – gilt für jede Seite, in Figma und im Code)

Leitsatz: **So wenig Content wie möglich, so viel wie nötig.** Ein Laie ohne Statistik-Hintergrund muss die Seite
lesen können. Vor jeder Seite beim Minimum anfangen und jede Zeile, Spalte und jedes Badge fragen: „Braucht ein Laie
das hier?“ Entstanden am Results-Overview (Figma: `Results / a-running-no-verdict / dark / lab-slate · v3`).

**Reihenfolge**
- Zahlen zuerst, dann Kontext (Distribution, Hypothese/Setup), dann Checks und History.

**Text**
- Keine Fußnoten unter Tabellen, keine Erklärzeilen unter Charts, keine Untertitel, die nur beschreiben, was man sieht.
- Kein Element ohne Funktion (z. B. ein Hinweis, der nur erklärt, warum es hier keine Filter gibt).
- Kein Jargon im sichtbaren Text („excluded from n“ → „not counted in any numbers“).
- Ausnahme: Text, den ein Vertrag ausdrücklich sichtbar verlangt (z. B. der Channels-Hinweis aus 4.10), bleibt sichtbar.
  Kollidiert das mit dieser Regel, den Konflikt ansprechen statt ihn in einen Tooltip zu verschieben.

**Tooltips („?“) – nur, wo ein Laie wirklich stolpert**
- Ja: Fachbegriffe und Begriffe mit überraschender Definition – z. B. Sample Size / „Not yet conclusive“, SRM,
  Guardrail, Tainted days, Key, Salt, Visitor type („new“ = neu im Shop), Channel (Last Touch, weicht von Shopify
  Analytics ab), Conversions vs. Orders.
- Nein: selbsterklärende Labels – Spaltenköpfe wie Visitors, Orders, Revenue, AOV, Device, Mobile/Desktop, Primary
  metric, Bot traffic, Code edits, Legendenzeilen.
- Ein Tooltip pro Begriff an der ersten Stelle, nicht an jeder Legendenzeile darunter. Texte weiter aus dem
  Glossar-Modul.

**Tabellen und Daten**
- Eine Gesamttabelle statt mehrerer Teiltabellen; wird sie zu breit, scrollt sie horizontal in ihrem eigenen
  Container, die erste Spalte bleibt stehen.
- Gesperrte oder leere Werte („unlocks at …“) bekommen keine eigene Spalte – die Spalte erscheint, wenn es den Wert gibt.
- Hervorhebung der Primärmetrik über Größe und eine leicht hinterlegte Spalte, nicht über zusätzlichen Text.
- Abgeleitetes klein unter dem Wert (Lift „+11,6 % vs A“), nicht als eigene Spalte. Vor erreichter Sample Size
  bleiben Lifts neutral grau – nie grün/rot.
- Keine Deko-Charts (Sparklines in Tabellen), wenn der richtige Chart in einem anderen Tab liegt.
- Keine Doppelangaben: Prozent **oder** absolute Zahl sichtbar, das andere im Hover.
- Keine Badges in Tabellenzeilen, die schon an anderer Stelle stehen (Code-Edit steht in Checks/History).

**Status**
- Vorläufiges ist klein: ein nicht finaler Status (Verdict vor Sample Size) ist eine schmale Zeile; groß wird er erst,
  wenn er etwas aussagt.

**Technische Infos**
- IDs und Technisches (Experiment-Key, Salt) nie in den Header, sondern ins Setup bzw. zugeklappte Details.

**Laden**
- Kein Auto-Polling. Laden beim Öffnen, neu laden bei Rückkehr in den Tab, Refresh-Button mit „Updated n s ago“.
