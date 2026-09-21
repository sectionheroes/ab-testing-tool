import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0029: two UI worlds, split by route. app/routes/app.* is Polaris Web Components only,
// everything else is DESIGN.md (Tailwind + daisyUI) without any <s-*> element.
const ROOT = join(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(ROOT).map((f) => ({ path: relative(ROOT, f), source: readFileSync(f, "utf8") }));
const isEmbeddedRoute = (path: string) => /^routes\/app(\.|\/)/.test(path) || path === "routes/app.tsx";
const embedded = files.filter((f) => isEmbeddedRoute(f.path));
const others = files.filter((f) => !isEmbeddedRoute(f.path));

describe("UI split (ADR-0029)", () => {
  it("finds both worlds", () => {
    expect(embedded.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
  });

  it("app/routes/app.* imports nothing from app/components", () => {
    const offenders = embedded.filter((f) => /from\s+["'](\.\.\/|~\/|app\/)components\//.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("app/routes/app.* uses no className (Tailwind/daisyUI)", () => {
    const offenders = embedded.filter((f) => /\bclassName\s*=/.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("app/routes/app.* never renders <s-button variant=\"primary\">", () => {
    const offenders = embedded.filter((f) => /<s-button[^>]*variant=["']primary["']/.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no <s-*> element outside app/routes/app.*", () => {
    const offenders = others.filter((f) => /<s-[a-z]/.test(f.source)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
