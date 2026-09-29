/**
 * Stake Keno payout multipliers, indexed [risk][picks - 1][hits].
 * Every table is ~99% RTP (verified in tests against the hypergeometric
 * distribution of 10 draws from 40 squares).
 */
export const RISKS = ['classic', 'low', 'medium', 'high'] as const;
export type Risk = (typeof RISKS)[number];

export const RISK_LABEL: Record<Risk, string> = {
  classic: 'Classic',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const PAYOUTS: Record<Risk, readonly (readonly number[])[]> = {
  classic: [
    [0, 3.96],
    [0, 1.9, 4.5],
    [0, 1, 3.1, 10.4],
    [0, 0.8, 1.8, 5, 22.5],
    [0, 0.25, 1.4, 4.1, 16.5, 36],
    [0, 0, 1, 3.68, 7, 16.5, 40],
    [0, 0, 0.47, 3, 4.5, 14, 31, 60],
    [0, 0, 0, 2.2, 4, 13, 22, 55, 70],
    [0, 0, 0, 1.55, 3, 8, 15, 44, 60, 85],
    [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100],
  ],
  low: [
    [0.7, 1.85],
    [0, 2, 3.8],
    [0, 1.1, 1.38, 26],
    [0, 0, 2.2, 7.9, 90],
    [0, 0, 1.5, 4.2, 13, 300],
    [0, 0, 1.1, 2, 6.2, 100, 700],
    [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  ],
  medium: [
    [0.4, 2.75],
    [0, 1.8, 5.1],
    [0, 0, 2.8, 50],
    [0, 0, 1.7, 10, 100],
    [0, 0, 1.4, 4, 14, 390],
    [0, 0, 0, 3, 9, 180, 710],
    [0, 0, 0, 2, 7, 30, 400, 800],
    [0, 0, 0, 2, 4, 11, 67, 400, 900],
    [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  ],
  high: [
    [0, 3.96],
    [0, 0, 17.1],
    [0, 0, 0, 81.5],
    [0, 0, 0, 10, 259],
    [0, 0, 0, 4.5, 48, 450],
    [0, 0, 0, 0, 11, 350, 710],
    [0, 0, 0, 0, 7, 90, 400, 800],
    [0, 0, 0, 0, 5, 20, 270, 600, 900],
    [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  ],
};

export function isRisk(v: unknown): v is Risk {
  return typeof v === 'string' && (RISKS as readonly string[]).includes(v);
}

export function payoutRow(risk: Risk, picks: number): readonly number[] {
  const row = PAYOUTS[risk][picks - 1];
  if (!row) throw new RangeError(`picks must be 1..10, got ${picks}`);
  return row;
}

export function multiplierFor(risk: Risk, picks: number, hits: number): number {
  return payoutRow(risk, picks)[hits] ?? 0;
}

/** Binomial coefficient as a double (exact for the small values used here). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** P(exactly `hits` of your `picks` squares are among the 10 drawn from 40). */
export function hitProbability(picks: number, hits: number): number {
  return (choose(10, hits) * choose(30, picks - hits)) / choose(40, picks);
}

/** P(at least `threshold` of `picks` squares drawn). */
export function atLeastProbability(picks: number, threshold: number): number {
  let p = 0;
  for (let h = Math.max(0, threshold); h <= Math.min(picks, 10); h++) p += hitProbability(picks, h);
  return p;
}

export function hitDistribution(picks: number): number[] {
  const out: number[] = [];
  for (let h = 0; h <= picks; h++) out.push(hitProbability(picks, h));
  return out;
}

export function theoreticalRtp(risk: Risk, picks: number): number {
  const row = payoutRow(risk, picks);
  let rtp = 0;
  for (let h = 0; h < row.length; h++) rtp += row[h] * hitProbability(picks, h);
  return rtp;
}

/** Standard deviation of the per-bet return multiplier (for RTP confidence intervals). */
export function payoutStdDev(risk: Risk, picks: number): number {
  const row = payoutRow(risk, picks);
  const mean = theoreticalRtp(risk, picks);
  let v = 0;
  for (let h = 0; h < row.length; h++) v += hitProbability(picks, h) * (row[h] - mean) ** 2;
  return Math.sqrt(v);
}
