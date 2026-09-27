import { describe, expect, it } from "vitest";
import { Rng } from "./random";

describe("Rng", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const sameSeed = Array.from({ length: 5 }, () => new Rng(42).uniform());
    expect(new Set(sameSeed).size).toBe(1); // same seed, same first draw

    const first = (seed: number, draws: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: draws }, () => rng.uniform());
    };
    expect(first(1, 5)).toEqual(first(1, 5)); // a whole sequence replays
    expect(first(1, 5)).not.toEqual(first(7, 5));
  });

  it("stays inside (0, 1) and has the right first two moments", () => {
    const rng = new Rng(2026);
    let sum = 0;
    let sumSq = 0;
    let outOfRange = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const u = rng.uniform();
      if (!(u > 0 && u < 1)) outOfRange++;
      sum += u;
      sumSq += u * u;
    }
    expect(outOfRange).toBe(0);
    expect(sum / n).toBeCloseTo(0.5, 2);
    expect(sumSq / n - (sum / n) ** 2).toBeCloseTo(1 / 12, 3);
  });

  it("normal() has mean 0 and variance 1", () => {
    const rng = new Rng(7);
    const n = 200_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = rng.normal();
      sum += z;
      sumSq += z * z;
    }
    expect(sum / n).toBeCloseTo(0, 2);
    expect(sumSq / n - (sum / n) ** 2).toBeCloseTo(1, 2);
  });

  it("binomial() matches mean and variance n·p and n·p·(1−p)", () => {
    const rng = new Rng(99);
    const n = 20_000;
    const p = 0.03;
    const draws = 5_000;
    let sum = 0;
    let sumSq = 0;
    let outOfRange = 0;
    for (let i = 0; i < draws; i++) {
      const k = rng.binomial(n, p);
      if (k < 0 || k > n) outOfRange++;
      sum += k;
      sumSq += k * k;
    }
    expect(outOfRange).toBe(0);
    const mean = sum / draws;
    const variance = sumSq / draws - mean * mean;
    expect(mean).toBeCloseTo(n * p, -1); // 600 ± a few
    expect(Math.abs(mean - n * p)).toBeLessThan(10);
    expect(Math.abs(variance - n * p * (1 - p)) / (n * p * (1 - p))).toBeLessThan(0.1);
    expect(rng.binomial(100, 0)).toBe(0);
    expect(rng.binomial(100, 1)).toBe(100);
  });
});
