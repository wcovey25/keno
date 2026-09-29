/** Small numeric helpers: special functions for p-values, popcount, RNG. */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // series for P, then Q = 1 − P
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
  }
  // Lentz continued fraction for Q
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h);
}

/** Upper-tail p-value of a χ² statistic with `df` degrees of freedom. */
export function chiSquarePValue(stat: number, df: number): number {
  if (df <= 0 || !Number.isFinite(stat)) return NaN;
  return gammaQ(df / 2, stat / 2);
}

export function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** Deterministic PRNG (mulberry32) so sampled scans are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Welford running mean / variance. */
export class RunningStats {
  n = 0;
  mean = 0;
  private m2 = 0;
  max = -Infinity;
  push(x: number): void {
    this.n++;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
    if (x > this.max) this.max = x;
  }
  get variance(): number {
    return this.n > 1 ? this.m2 / (this.n - 1) : 0;
  }
  get std(): number {
    return Math.sqrt(this.variance);
  }
}

/**
 * Downsample a series to ≤ `maxPoints` using min/max bucketing, which keeps
 * the visual envelope (peaks and drawdowns) of long P&L curves intact.
 */
export function downsample(values: ArrayLike<number>, maxPoints: number): { x: number[]; y: number[] } {
  const n = values.length;
  const x: number[] = [];
  const y: number[] = [];
  if (n <= maxPoints) {
    for (let i = 0; i < n; i++) {
      x.push(i);
      y.push(values[i]);
    }
    return { x, y };
  }
  const buckets = Math.max(1, Math.floor(maxPoints / 2));
  const size = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * size);
    const e = Math.min(n, Math.floor((b + 1) * size));
    let mi = s, ma = s;
    for (let i = s; i < e; i++) {
      if (values[i] < values[mi]) mi = i;
      if (values[i] > values[ma]) ma = i;
    }
    const [a, c] = mi < ma ? [mi, ma] : [ma, mi];
    x.push(a); y.push(values[a]);
    if (c !== a) { x.push(c); y.push(values[c]); }
  }
  if (x[x.length - 1] !== n - 1) { x.push(n - 1); y.push(values[n - 1]); }
  return { x, y };
}
