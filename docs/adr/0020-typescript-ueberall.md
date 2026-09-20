# ADR-0020: Sprache: TypeScript überall (Backend, Stats, Snippet, CLI)

Datum: 2026-09-20 · Status: entschieden

## Kontext
DESIGN.md sagt "kein TS nötig". Stats-Engine und Snippet brauchen aber Typen: Vertragsformate (4.2, 4.5), Bucketing, Testfunktionen.

## Entscheidung
TypeScript in `app/`, `lib/stats`, `lib/snippet`, `lib/cli`; UI-Komponenten dürfen `.tsx` sein. Snippet wird mit esbuild gebaut.

## Alternativen
- JavaScript nach DESIGN.md – keine Typprüfung an den Vertragsgrenzen.
- TS nur in `lib/` – zwei Toolchains in einem Package.

## Konsequenzen
- Ein Stack, ein Linter, ein Test-Runner.
- Snippet-Budget 8 KB gzip gilt für das gebaute JS, nicht für die TS-Quelle.
