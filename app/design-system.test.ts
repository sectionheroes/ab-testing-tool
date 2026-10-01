/**
 * Guards for the two rules WP5a introduced that would otherwise drift silently.
 *
 * 1. `app/app.css` and the CSS block in DESIGN.md §2 must stay identical. They were copied apart once already (the
 *    spec carried the lab theme from 27.09. while the stylesheet still had the old warm look, and nobody noticed for
 *    four days, because nothing compares them).
 * 2. No hex colours in `className`. DESIGN.md §9 says it, Figma hands out nothing but raw hex, so every transfer is
 *    a chance to paste one in.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("app.css mirrors DESIGN.md §2", () => {
  it("is byte-identical apart from the header comment", () => {
    const css = readFileSync(join(ROOT, "app.css"), "utf8");
    const design = readFileSync(join(ROOT, "..", "docs", "DESIGN.md"), "utf8");

    const start = design.indexOf("```css\n/* app/app.css */");
    expect(start, "DESIGN.md §2 has no ```css block starting with /* app/app.css */").toBeGreaterThan(-1);
    const block = design.slice(start + "```css\n".length, design.indexOf("\n```", start));

    // Only the first line differs: app.css carries the "must stay identical" reminder, the spec carries the path.
    const strip = (text: string) => text.split("\n").slice(1).join("\n").trimEnd();
    expect(strip(block)).toBe(strip(css));
  });
});

describe("no hex colours in className (DESIGN.md §9)", () => {
  /**
   * The documented exceptions, both of which are *data* rather than theme:
   *  - chart colours, which §4 fixes as literals in both modes;
   *  - the ShopSwitcher favicon palette, which stands in for a per-shop brand colour.
   * Both live in `style`/JS, not in a class — the assertion below only looks at `className`.
   */
  const files = walk(ROOT)
    .map((f) => ({ path: relative(ROOT, f), source: readFileSync(f, "utf8") }))
    // /app/* is Polaris and has no classes at all (ADR-0029); the styleguide is dev-only but follows the same rule.
    .filter((f) => !/^routes\/app(\.|\/)/.test(f.path));

  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no #rrggbb inside a className", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // className="…" / className={"…"} / className={`…`} – every string that reaches a class attribute.
      for (const m of f.source.matchAll(/className\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
        if (/#[0-9a-fA-F]{3,8}\b/.test(m[0])) offenders.push(`${f.path}: ${m[0].slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no Tailwind slate-/emerald- palette classes", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of f.source.matchAll(/className\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
        const hit = m[0].match(/\b(?:bg|text|border|from|to|via|ring|fill|stroke)-(?:slate|emerald|zinc|gray|neutral|red|green|amber|sky)-\d{2,3}\b/);
        if (hit) offenders.push(`${f.path}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
