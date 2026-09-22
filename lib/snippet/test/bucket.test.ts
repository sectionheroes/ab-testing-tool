import { describe, expect, it } from "vitest";
import { bucket, fnv1a32 } from "../src/bucket";

const ab = { key: "pdp-reviews-above-price", salt: "k3f9", allocation: 1, variants: [{ key: "a", weight: 0.5, js: null, css: null }, { key: "b", weight: 0.5, js: null, css: null }] };
const abc = { ...ab, key: "three", variants: [{ key: "a", weight: 0.2, js: null, css: null }, { key: "b", weight: 0.3, js: null, css: null }, { key: "c", weight: 0.5, js: null, css: null }] };

// Deterministic pseudo-random ids so the distribution test is reproducible.
function ids(n: number): string[] {
  let x = 123456789;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push(`${x.toString(16)}-${i}-${(x ^ 0xdeadbeef).toString(36)}`);
  }
  return out;
}

describe("fnv1a32", () => {
  it("matches the published FNV-1a 32-bit test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });
});

describe("bucket (contract 4.4)", () => {
  it("is deterministic across 1,000 runs", () => {
    const first = bucket("7f2a3c1e-1111-4222-8333-444455556666", ab);
    for (let i = 0; i < 1000; i++) expect(bucket("7f2a3c1e-1111-4222-8333-444455556666", ab)).toBe(first);
  });

  it("reference vector – any change to hash, input format or cut logic must fail this", () => {
    // Frozen on 2026-09-22 from the first implementation: [vid, allocation 1, allocation 0.5, 20/30/50 split].
    const vector: [string, string, string | null, string][] = [
      ["00000000-0000-4000-8000-000000000001", "a", "a", "c"],
      ["00000000-0000-4000-8000-000000000002", "a", "b", "a"],
      ["1c9a7d2e-5b3f-4a6c-9d8e-0f1a2b3c4d5e", "a", "a", "b"],
      ["ffffffff-ffff-4fff-bfff-ffffffffffff", "b", null, "c"],
      ["deadbeef-dead-4eef-bead-beefdeadbeef", "a", "b", "b"],
    ];
    for (const [vid, full, half, three] of vector) {
      expect(bucket(vid, ab)).toBe(full);
      expect(bucket(vid, { ...ab, allocation: 0.5 })).toBe(half);
      expect(bucket(vid, abc)).toBe(three);
    }
  });

  it("distribution over 100,000 ids: every variant within ±1 % of its weight", () => {
    const all = ids(100_000);
    for (const exp of [ab, abc]) {
      const counts: Record<string, number> = {};
      for (const id of all) {
        const k = bucket(id, exp)!;
        counts[k] = (counts[k] || 0) + 1;
      }
      for (const v of exp.variants) expect(Math.abs(counts[v.key] / all.length - v.weight)).toBeLessThan(0.01);
    }
  });

  it("allocation 0.5 keeps 50 % ±1 % out, and the inside still splits by weight", () => {
    const all = ids(100_000);
    let out = 0;
    const counts: Record<string, number> = {};
    for (const id of all) {
      const k = bucket(id, { ...ab, allocation: 0.5 });
      if (k === null) out++;
      else counts[k] = (counts[k] || 0) + 1;
    }
    expect(Math.abs(out / all.length - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(counts.a / (all.length - out) - 0.5)).toBeLessThan(0.01);
  });

  it("salt and experiment key change the assignment", () => {
    const all = ids(2000);
    let diffSalt = 0;
    let diffKey = 0;
    for (const id of all) {
      if (bucket(id, ab) !== bucket(id, { ...ab, salt: "other" })) diffSalt++;
      if (bucket(id, ab) !== bucket(id, { ...ab, key: "other" })) diffKey++;
    }
    expect(diffSalt).toBeGreaterThan(800);
    expect(diffKey).toBeGreaterThan(800);
  });
});
