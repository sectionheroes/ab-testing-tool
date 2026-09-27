/**
 * Distribution functions for lib/stats. Pure, no dependencies, double precision.
 *
 * Every function here is cross-checked against scipy 1.13 in test/distributions.test.ts. The accuracy that matters for
 * this project is 4 decimals on the published worked examples (ADR-0018); the algorithms below are good to ~1e-14, so
 * the reference tests pass on the statistic, not on a lucky rounding.
 */

/** Φ(x) – standard normal CDF. Hart's (1968) rational approximation in the form given by West, "Better approximations
 * to cumulative normal functions", Wilmott Magazine 2005, 70–76. Double-precision accurate over the whole range. */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const abs = Math.abs(x);
  let tail: number;
  if (abs > 37) {
    tail = 0;
  } else {
    const e = Math.exp((-abs * abs) / 2);
    if (abs < 7.07106781186547) {
      let num = 3.52624965998911e-2 * abs + 0.700383064443688;
      num = num * abs + 6.37396220353165;
      num = num * abs + 33.912866078383;
      num = num * abs + 112.079291497871;
      num = num * abs + 221.213596169931;
      num = num * abs + 220.206867912376;
      let den = 8.83883476483184e-2 * abs + 1.75566716318264;
      den = den * abs + 16.064177579207;
      den = den * abs + 86.7807322029461;
      den = den * abs + 296.564248779674;
      den = den * abs + 637.333633378831;
      den = den * abs + 793.826512519948;
      den = den * abs + 440.413735824752;
      tail = (e * num) / den;
    } else {
      // continued fraction for the far tail
      let cf = abs + 0.65;
      cf = abs + 4 / cf;
      cf = abs + 3 / cf;
      cf = abs + 2 / cf;
      cf = abs + 1 / cf;
      tail = e / (cf * 2.506628274631);
    }
  }
  return x > 0 ? 1 - tail : tail;
}

/** Two-sided p-value of a z statistic: P(|Z| >= |z|). */
export function normalTwoSidedP(z: number): number {
  return 2 * normalCdf(-Math.abs(z));
}

const ACKLAM_A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const ACKLAM_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const ACKLAM_C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ACKLAM_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/**
 * Φ⁻¹(p) – standard normal quantile. Acklam's rational approximation (relative error < 1.15e-9) followed by one
 * Halley refinement step against normalCdf, which brings it to double precision.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) * q + ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r + ACKLAM_A[4]) * r + ACKLAM_A[5]) * q) /
      (((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r + ACKLAM_B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q + ACKLAM_C[4]) * q + ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1);
  }
  // Halley step: e = Φ(x) − p, u = e·√(2π)·e^{x²/2}
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** ln Γ(x) – Lanczos approximation (g = 7, n = 9), relative error < 1e-15 for x > 0. */
export function logGamma(x: number): number {
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = g[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const EPS = 3e-16;
const FPMIN = 1e-300;
const MAX_ITER = 500;

/** Regularised lower incomplete gamma P(a, x), series expansion (Numerical Recipes §6.2 `gser`). */
function gammaSeries(a: number, x: number): number {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 0; n < MAX_ITER; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Regularised upper incomplete gamma Q(a, x), modified Lentz continued fraction (Numerical Recipes §6.2 `gcf`). */
function gammaContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Regularised lower incomplete gamma P(a, x) = γ(a, x)/Γ(a). */
export function lowerGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaContinuedFraction(a, x);
}

/** Regularised upper incomplete gamma Q(a, x) = 1 − P(a, x), computed without the cancelling subtraction in the tail. */
export function upperGamma(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x);
}

/** χ² CDF with `df` degrees of freedom. */
export function chiSquareCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  return lowerGamma(df / 2, x / 2);
}

/** Upper-tail p-value of a χ² statistic: P(X >= x). Goes through upperGamma, so a p-value of 1e-17 stays 1e-17
 * instead of collapsing to 0 the way `1 − cdf` would – the SRM alarm reports the number, not just the verdict. */
export function chiSquareUpperP(x: number, df: number): number {
  if (x <= 0) return 1;
  return upperGamma(df / 2, x / 2);
}

/** Continued fraction for the incomplete beta function (Numerical Recipes §6.4 `betacf`). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(a, b, x)) / a : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Student's t CDF with `df` (possibly fractional) degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (df <= 0) return NaN;
  const half = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - half : half;
}

/** Two-sided p-value of a t statistic: P(|T| >= |t|). */
export function studentTTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return Number.isNaN(t) ? NaN : 0;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/**
 * Student's t quantile. Bisection on studentTCdf – slower than a closed form but exact to 1e-12 and impossible to get
 * subtly wrong; it is called a handful of times per evaluation, never in a loop.
 */
export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) return NaN;
  if (p === 0.5) return 0;
  let lo = -1e3;
  let hi = 1e3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-13) break;
  }
  return (lo + hi) / 2;
}
