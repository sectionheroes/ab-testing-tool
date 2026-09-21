# DESIGN.md — Sectionheroes Admin-Look

Design-Spec für neue Software, die exakt wie das Sectionheroes-Admin-Dashboard aussehen soll.
Diese Datei ist als Anweisung für Claude Code gedacht: **Halte dich beim Bauen von UI strikt an
diese Tokens, Klassen und Rezepte.** Nicht improvisieren, keine anderen UI-Libraries.

---

## 1. Stack

- **React** (JSX, kein TypeScript nötig) + **React Router v7** (Framework-Mode)
- **Tailwind CSS v4** (`@tailwindcss/vite`) + **daisyUI 5** (`@plugin "daisyui"`)
- **Kein** Polaris, kein shadcn, kein MUI, keine Icon-Library — Icons sind kleine Inline-SVGs
- Gilt für das Dashboard und den Login. Die embedded Shopify-Merchant-Seite `/app/*` ist ausgenommen: dort ausschließlich Polaris Web Components, keine DESIGN.md-Bausteine (siehe `docs/adr/0029`).
  (24er-Viewbox, `stroke="currentColor" strokeWidth="2"`, 15–16px groß)
- Charts: handgeschriebene SVGs (Area, Sparkline, Donut), keine Chart-Library
- Font: **Inter** (Google Fonts laden), Fallback `system-ui`

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

Zwei Themes: `dark` (Original-Look) und `light`. Brand-Akzente (Mint + Lila) sind in **beiden**
Modes identisch — nur Flächen, Borders, Text und Status-Farben wechseln.

```css
/* app/app.css */
@import "tailwindcss";

@plugin "daisyui" {
  themes: false;
}

/* ── Dark (Original) ─────────────────────────────────────────────────────── */
@plugin "daisyui/theme" {
  name: "dark";
  default: false;
  prefersdark: true; /* greift automatisch bei OS-Dark-Mode */
  color-scheme: dark;

  --color-base-100: #1c1b1b; /* Seiten-Hintergrund */
  --color-base-200: #2e2c2c; /* Panels / Cards / Inputs */
  --color-base-300: #403d3d; /* Borders, aktive Tabs, Hover auf Inputs */
  --color-base-content: #edeaea;

  --color-primary: #9dd1bb;         /* Mint — Hauptaktion */
  --color-primary-content: #000000; /* IMMER schwarze Schrift auf Mint */
  --color-secondary: #c5acd3;       /* Lila — Badges / sekundäre Akzente */
  --color-secondary-content: #000000;
  --color-accent: #c5acd3;
  --color-accent-content: #000000;
  --color-info: #c5acd3;
  --color-info-content: #000000;

  --color-neutral: #171616;         /* Unsaved-Changes-Bar */
  --color-neutral-content: #edeaea;

  --color-success: #4cc366;
  --color-success-content: #0c2513;
  --color-warning: #e9b24e;
  --color-warning-content: #271e0a;
  --color-error: #ff6b6b;
  --color-error-content: #2d0f0f;

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

  --color-primary: #9dd1bb;         /* identisch zu Dark */
  --color-primary-content: #000000;
  --color-secondary: #c5acd3;
  --color-secondary-content: #000000;
  --color-accent: #c5acd3;
  --color-accent-content: #000000;
  --color-info: #c5acd3;
  --color-info-content: #000000;

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

@theme {
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
}

@layer base {
  body {
    margin: 0;
    background: var(--color-base-100);
    color: var(--color-base-content);
  }
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
```

Fonts in `root.jsx` per `links()`:

```js
{ rel: "preconnect", href: "https://fonts.googleapis.com" },
{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
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
| Aktiver Nav-Eintrag | `bg-base-content/10 text-base-content` | **`bg-white/10 text-white`** |
| Tag-Chip in Input | `bg-base-content/10` | `bg-white/10` |
| Hauptaktion | `btn btn-primary` (Mint, schwarze Schrift) | — |
| Sekundär-Akzent / Badge | `badge-secondary` (Lila, schwarze Schrift) | — |

**Mint (`#9dd1bb`) und Lila (`#c5acd3`) nur als Fläche mit schwarzer Schrift verwenden**
(`btn-primary`, `badge-primary`, `badge-secondary`, `bg-primary/20 text-primary` für kleine
Feature-Kacheln im Dark Mode). **Nicht** als reine Textfarbe auf `base-100/200` — im Light Mode
ist das unlesbar. Deshalb: `badge-soft` / `alert-soft` nur mit `success | warning | error`, nie mit
`primary | secondary`.

Status-Farben (`success`, `warning`, `error`) dürfen pro Mode abweichen — sie sind in den Themes
schon passend gesetzt. Einfach `badge-soft badge-success` etc. nutzen.

Chart-Farben (hart, in beiden Modes gleich):

```js
const C = { green: "#22c55e", red: "#ef4444", purple: "#8b7bf0", blue: "#60a5fa", amber: "#e0a34a", teal: "#2dd4bf" };
```

Logo: Sectionheroes-Logo als weißes PNG existiert nur für Dark. Für Light eine dunkle Variante
hinterlegen und per `[data-theme=light]` / `dark:`-Äquivalent tauschen (z. B. zwei `<img>` mit
`hidden`-Toggle über `[data-theme="light"] .logo-dark { display:none }`).

---

## 5. Typografie & Maße

- Basis: `text-sm` (14px) für fast alles; `text-xs` (12px) für Meta/Labels; `text-[11px] uppercase tracking-wider text-base-content/50` für Card-Titel und Sidebar-Gruppen.
- Seitentitel: `text-2xl font-semibold`. Section-Titel in Forms: `text-base font-semibold`. Login-Card: `text-lg font-semibold`.
- KPI-Wert: `text-xl font-semibold`, Zahlen mit `tabular-nums`.
- Radius: Inputs/Buttons/Nav `rounded-lg` (8px), Tabs innen `rounded-md`, Cards/Tabellen/Dropdowns `rounded-box` (12px).
- Schatten nur für schwebende Elemente: Dropdowns `shadow-lg`, DateRange-Popover `shadow-xl`, Tooltip-Popover `shadow-lg`. Cards **kein** Schatten, nur `border border-base-300`.
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
            "mb-0.5 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors " +
            (isActive ? "bg-base-content/10 text-base-content"
              : isPending ? "bg-base-content/5 text-base-content"
              : "hover:bg-base-content/5")}>
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
      <div className="truncate px-0.5 pb-2 text-xs text-base-content/60">user@mail.de</div>
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
- Primär: `btn btn-primary` (+ `btn-sm` in Bars/Tabellen, `btn-xs` in Chips, `btn-block` in Login)
- Sekundär/Default: `btn btn-sm` (daisyUI-Default = base-200-Fläche)
- Ghost: `btn btn-ghost btn-sm`
- Icon-Only: `btn btn-ghost btn-sm btn-square`
- Destruktiv: `btn btn-error btn-sm` oder `btn btn-ghost btn-sm text-error`
- Textlink: `hover:underline`; Löschen-X in Listen: `text-base-content/30 hover:text-error`

### Badges
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
- Tooltip-„?": `ml-1.5 inline-flex size-4 cursor-help items-center justify-center rounded-full bg-base-content/10 align-middle text-[10px] font-semibold text-base-content/60` mit `title`
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
- Nur daisyUI-Semantik-Tokens (`base-*`, `primary`, `secondary`, `neutral`, `success/warning/error`) + Opacity-Modifier (`/60`, `/40` …).
- Cards flach: Border, kein Schatten. Schatten nur für Popovers.
- Kompakt: `btn-sm`, `table-sm`, `input-sm` in Bars; Standardgröße nur in Formularen.
- Icons als Inline-SVG, `currentColor`, 15–16px, in `text-base-content/40–50`.

**Don't**
- Kein `text-white`, `bg-white/*`, `bg-black`, `text-gray-*`, keine Hex-Farben in Klassen (Ausnahme: Chart-Farben via `style`).
- Kein `badge-soft` / `alert-soft` mit `primary` oder `secondary`.
- Keine `shadow-*` auf Cards, keine `rounded-full` Buttons, keine Gradienten (außer bewusst als AI-Feature-Button).
- Keine zusätzlichen UI-Libraries (Polaris, shadcn, Radix, MUI, Headless UI).
