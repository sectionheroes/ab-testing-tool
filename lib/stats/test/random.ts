/**
 * Seeded RNG for the simulation tests. Not part of the public lib/stats surface – nothing in production draws random
 * numbers. Deterministic by construction, so the A/A false-positive rate is a fixed number, not a coin flip in CI.
 *
 * xoshiro128** (Blackman & Vigna, 2018), period 2^128 − 1, seeded through splitmix32.
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private spareNormal: number | null = null;

  constructor(seed: number) {
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
  }

  /** Raw 32-bit output. */
  private nextUint32(): number {
    const x = Math.imul(this.s1, 5) >>> 0;
    const result = Math.imul(((x << 7) | (x >>> 25)) >>> 0, 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;
    return result;
  }

  /** Uniform on (0, 1) – never exactly 0, so Math.log() is always finite. */
  uniform(): number {
    return (this.nextUint32() + 0.5) / 4294967296;
  }

  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.uniform() * (hi - lo + 1));
  }

  /** Standard normal, Box–Muller with the second value cached. */
  normal(): number {
    if (this.spareNormal !== null) {
      const v = this.spareNormal;
      this.spareNormal = null;
      return v;
    }
    const r = Math.sqrt(-2 * Math.log(this.uniform()));
    const theta = 2 * Math.PI * this.uniform();
    this.spareNormal = r * Math.sin(theta);
    return r * Math.cos(theta);
  }

  /** Lognormal with the given parameters of the underlying normal. */
  lognormal(mu: number, sigma: number): number {
    return Math.exp(mu + sigma * this.normal());
  }

  /**
   * Binomial(n, p) by geometric skipping: draw the gaps between successes instead of n Bernoulli trials. Exactly the
   * same distribution as summing n Bernoullis (the z-test only sees the count), but O(n·p) draws instead of O(n) –
   * without it the 10 000 × 2 × up to 50 000 trials of the CR simulation would dominate the runtime.
   */
  binomial(n: number, p: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return n;
    const logQ = Math.log1p(-p);
    let count = 0;
    let position = 0;
    for (;;) {
      const gap = Math.floor(Math.log(this.uniform()) / logQ);
      position += gap + 1;
      if (position > n) return count;
      count++;
    }
  }
}
