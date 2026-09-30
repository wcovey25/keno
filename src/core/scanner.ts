/**
 * Combination scanner — ranks k-tile combinations by how overdue / hot / cold
 * they are and by the RTP they would have produced over the window.
 *
 * Performance: each tile's appearances are stored as a bitset over draws
 * (32 draws per word). For a combination we add its k bitsets into 4 bit-planes
 * (a per-draw 4-bit counter, k ≤ 10 < 16), then derive "matches ≥ threshold" and
 * "matches = h" masks with a handful of bitwise ops per word. That processes 32
 * draws per operation instead of looping per draw.
 *
 * Search space: C(|pool|, k) can be astronomically large (C(40,10) ≈ 8.5e8), so
 * the scanner enumerates exhaustively when it fits the combo budget and
 * otherwise draws a reproducible uniform random sample of distinct combinations.
 */
import { KENO_DRAWS, KENO_SQUARES } from './provablyFair';
import { atLeastProbability, choose, payoutRow, theoreticalRtp, type Risk } from './payouts';
import { mulberry32, popcount32 } from './mathx';

export const SCAN_SORTS = ['value', 'overdue', 'drought', 'longest', 'cold', 'hot', 'rtp'] as const;
export type ScanSort = (typeof SCAN_SORTS)[number];

export interface ScanParams {
  k: number;
  threshold: number;
  pool: number[];
  risk: Risk;
  sort: ScanSort;
  depth: number;
  maxCombos: number;
  /** Only rank combos that hit at least this many times (filters noise). */
  minEvents: number;
  seed: number;
}

export interface ComboResult {
  tiles: number[];
  events: number;
  rate: number;
  z: number;
  currentDrought: number;
  longestDrought: number;
  meanInterval: number;
  overdueRatio: number;
  droughtProbability: number;
  rtp: number;
  /** Best-scoring paying hit level (always computed; drives the 'value' ranking). */
  best: LevelPick | null;
}

/**
 * One paying hit level M of a combination ("≥ M of K matched"), scored the way
 * Keno Scanner v43's Recommendations did:
 *
 *   score = overdue × log₂(1 + payout) × reliability × rarity
 *
 *   overdue     = current gap ÷ expected interval (1 / P(≥M))
 *   log₂ payout = rewards bigger multipliers without letting 1000× swamp the list
 *   reliability = min(1, expected hits in window ÷ 5) — too little data ⇒ damped
 *   rarity      = 1 + log₁₀(expected interval) ÷ 2 — rarer events weigh more
 *
 * This is a ranking for fun and exploration — it does not change the odds.
 */
export interface LevelPick {
  m: number;
  payout: number;
  expectedInterval: number;
  expectedHits: number;
  events: number;
  gap: number;
  overdue: number;
  /** actual ÷ expected hits at this level. */
  luck: number;
  score: number;
}

export function valueScore(gap: number, expectedInterval: number, payout: number, expectedHits: number): number {
  const overdue = gap / expectedInterval;
  const reliability = Math.min(1, expectedHits / 5);
  const rarity = 1 + Math.log10(Math.max(1, expectedInterval)) / 2;
  return overdue * Math.log2(1 + payout) * reliability * rarity;
}

/** Paying levels worth targeting: hit counts whose multiplier returns a profit. */
export function profitLevels(risk: Risk, k: number): { m: number; payout: number; p: number }[] {
  const row = payoutRow(risk, k);
  const out: { m: number; payout: number; p: number }[] = [];
  for (let m = 1; m <= k; m++) if (row[m] > 1) out.push({ m, payout: row[m], p: atLeastProbability(k, m) });
  return out;
}

/** Events and last position of "counter ≥ m" over bit-planes built by evaluateCombo. */
export function levelFromPlanes(planes: Uint32Array, words: number, n: number, m: number): { events: number; last: number } {
  const tb0 = m & 1, tb1 = (m >> 1) & 1, tb2 = (m >> 2) & 1, tb3 = (m >> 3) & 1;
  let events = 0, lastWord = -1, lastMask = 0;
  for (let w = 0; w < words; w++) {
    const p0 = planes[w], p1 = planes[words + w], p2 = planes[2 * words + w], p3 = planes[3 * words + w];
    let gt = 0, eq = ~0;
    if (tb3) eq &= p3; else { gt |= eq & p3; eq &= ~p3; }
    if (tb2) eq &= p2; else { gt |= eq & p2; eq &= ~p2; }
    if (tb1) eq &= p1; else { gt |= eq & p1; eq &= ~p1; }
    if (tb0) eq &= p0; else { gt |= eq & p0; eq &= ~p0; }
    let ge = gt | eq;
    if (w === words - 1 && (n & 31)) ge &= (1 << (n & 31)) - 1;
    if (ge) {
      events += popcount32(ge);
      lastWord = w;
      lastMask = ge;
    }
  }
  return { events, last: lastWord < 0 ? -1 : (lastWord << 5) + 31 - Math.clz32(lastMask) };
}

export interface ScanResult {
  n: number;
  mode: 'exhaustive' | 'sampled';
  space: number;
  scanned: number;
  expectedRate: number;
  expectedInterval: number;
  theoreticalRtp: number;
  results: ComboResult[];
  elapsedMs: number;
}

/** Build per-tile bitsets: bits[t * words + w] bit b ⇔ tile t drawn in draw (w·32 + b). */
export function buildTileBitsets(drawn: Uint8Array, n: number): { bits: Uint32Array; words: number } {
  const words = Math.ceil(n / 32);
  const bits = new Uint32Array(KENO_SQUARES * words);
  for (let i = 0; i < n; i++) {
    const w = i >>> 5;
    const bit = 1 << (i & 31);
    const base = i * KENO_DRAWS;
    for (let j = 0; j < KENO_DRAWS; j++) bits[drawn[base + j] * words + w] |= bit;
  }
  return { bits, words };
}

function scoreOf(r: ComboResult, sort: ScanSort): number {
  switch (sort) {
    case 'overdue': return r.overdueRatio;
    case 'drought': return r.currentDrought;
    case 'longest': return r.longestDrought;
    case 'hot': return r.z;
    case 'cold': return -r.z;
    case 'rtp': return r.rtp;
    case 'value': return r.best ? r.best.score : -Infinity;
  }
}

/** Bounded min-heap keeping the `cap` highest-scoring results. */
class TopK {
  private heap: { s: number; r: ComboResult }[] = [];
  constructor(private readonly cap: number) {}
  /** Lowest score currently retained (−∞ while not full). */
  floor(): number {
    return this.heap.length < this.cap ? -Infinity : this.heap[0].s;
  }
  push(s: number, r: ComboResult): void {
    const h = this.heap;
    if (h.length < this.cap) {
      h.push({ s, r });
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (h[p].s <= h[i].s) break;
        [h[p], h[i]] = [h[i], h[p]];
        i = p;
      }
    } else if (s > h[0].s) {
      h[0] = { s, r };
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, rr = l + 1;
        let m = i;
        if (l < h.length && h[l].s < h[m].s) m = l;
        if (rr < h.length && h[rr].s < h[m].s) m = rr;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
  }
  sorted(): ComboResult[] {
    return [...this.heap].sort((a, b) => b.s - a.s).map((x) => x.r);
  }
}

export interface ScanProgress {
  scanned: number;
  total: number;
}

/**
 * Evaluate one combination. Exposed for testing; `planes` is scratch space of
 * 4 × words, `payMults` lists [hits, multiplier] pairs with a non-zero payout.
 */
export function evaluateCombo(
  bits: Uint32Array,
  words: number,
  n: number,
  combo: ArrayLike<number>,
  threshold: number,
  payMults: [number, number][],
  planes: Uint32Array,
): { events: number; last: number; firstHit: number; longest: number; sumIntervals: number; payout: number } {
  const k = combo.length;
  planes.fill(0);
  for (let c = 0; c < k; c++) {
    const off = combo[c] * words;
    for (let w = 0; w < words; w++) {
      let carry = bits[off + w];
      // ripple-carry add of a 1-bit value into the 4-bit counters
      let t = planes[w] & carry; planes[w] ^= carry; carry = t;
      if (!carry) continue;
      t = planes[words + w] & carry; planes[words + w] ^= carry; carry = t;
      if (!carry) continue;
      t = planes[2 * words + w] & carry; planes[2 * words + w] ^= carry; carry = t;
      planes[3 * words + w] ^= carry;
    }
  }

  let events = 0, last = -1, firstHit = -1, longest = 0, sumIntervals = 0, payout = 0;
  const tb0 = threshold & 1, tb1 = (threshold >> 1) & 1, tb2 = (threshold >> 2) & 1, tb3 = (threshold >> 3) & 1;
  for (let w = 0; w < words; w++) {
    const p0 = planes[w], p1 = planes[words + w], p2 = planes[2 * words + w], p3 = planes[3 * words + w];
    // counter ≥ threshold, MSB first
    let gt = 0, eq = ~0;
    if (tb3) eq &= p3; else { gt |= eq & p3; eq &= ~p3; }
    if (tb2) eq &= p2; else { gt |= eq & p2; eq &= ~p2; }
    if (tb1) eq &= p1; else { gt |= eq & p1; eq &= ~p1; }
    if (tb0) eq &= p0; else { gt |= eq & p0; eq &= ~p0; }
    let ge = gt | eq;
    if (w === words - 1 && (n & 31)) ge &= (1 << (n & 31)) - 1;

    for (let m = 0; m < payMults.length; m++) {
      const h = payMults[m][0];
      const e =
        (h & 1 ? p0 : ~p0) & (h & 2 ? p1 : ~p1) & (h & 4 ? p2 : ~p2) & (h & 8 ? p3 : ~p3);
      // h ≥ 1 for every entry, so bits past n (all-zero counters) never match.
      payout += popcount32(e) * payMults[m][1];
    }

    while (ge) {
      const low = ge & -ge;
      const pos = (w << 5) + (31 - Math.clz32(low));
      if (last >= 0) {
        const iv = pos - last;
        sumIntervals += iv;
        if (iv - 1 > longest) longest = iv - 1;
      } else {
        firstHit = pos;
        if (pos > longest) longest = pos;
      }
      last = pos;
      events++;
      ge ^= low;
    }
  }
  return { events, last, firstHit, longest, sumIntervals, payout };
}

export function scanCombos(
  drawn: Uint8Array,
  params: ScanParams,
  onProgress?: (p: ScanProgress) => void,
): ScanResult {
  const t0 = performance.now();
  const n = Math.floor(drawn.length / KENO_DRAWS);
  const { k, threshold } = params;
  const pool = [...new Set(params.pool)].filter((t) => t >= 0 && t < KENO_SQUARES).sort((a, b) => a - b);
  if (k < 1 || k > 10) throw new RangeError('k must be 1..10');
  if (threshold < 1 || threshold > k) throw new RangeError('threshold must be 1..k');
  if (pool.length < k) throw new RangeError(`pool has ${pool.length} tiles, need at least ${k}`);

  const p = atLeastProbability(k, threshold);
  const expectedInterval = 1 / p;
  const row = payoutRow(params.risk, k);
  const payMults: [number, number][] = [];
  // h = 0 never pays for k ≥ 2 (only 1-pick Low/Medium do); handled below for completeness.
  for (let h = 1; h <= k; h++) if (row[h] > 0) payMults.push([h, row[h]]);
  const zeroHitPay = row[0];
  const levels = profitLevels(params.risk, k);

  const { bits, words } = buildTileBitsets(drawn, n);
  const planes = new Uint32Array(4 * words);
  const space = choose(pool.length, k);
  const exhaustive = space <= params.maxCombos;
  const total = exhaustive ? space : params.maxCombos;
  const top = new TopK(Math.max(1, params.depth));
  const sd = Math.sqrt(n * p * (1 - p));
  const combo = new Int32Array(k);
  const tiles = new Int32Array(k);
  let scanned = 0;
  const progressEvery = Math.max(1, Math.floor(total / 100));

  // Planes still hold this combo's counters after evaluateCombo (the zero-hit path
  // rebuilds identical planes), so levels can be scored lazily from them.
  const bestLevel = (): LevelPick | null => {
    let best: LevelPick | null = null;
    for (const lv of levels) {
      const { events, last } = levelFromPlanes(planes, words, n, lv.m);
      const gap = last < 0 ? n : n - 1 - last;
      const expectedInterval = 1 / lv.p;
      const expectedHits = n * lv.p;
      const score = valueScore(gap, expectedInterval, lv.payout, expectedHits);
      if (!best || score > best.score) {
        best = {
          m: lv.m, payout: lv.payout, expectedInterval, expectedHits, events, gap,
          overdue: gap / expectedInterval, luck: expectedHits > 0 ? events / expectedHits : NaN, score,
        };
      }
    }
    return best;
  };

  const evalCurrent = () => {
    for (let i = 0; i < k; i++) tiles[i] = pool[combo[i]];
    const r = evaluateCombo(bits, words, n, tiles, threshold, payMults, planes);
    scanned++;
    if (onProgress && scanned % progressEvery === 0) onProgress({ scanned, total });
    if (r.events < params.minEvents) return;
    const current = r.last < 0 ? n : n - 1 - r.last;
    let payout = r.payout;
    if (zeroHitPay > 0) {
      // draws with zero matches = n − Σ(draws with ≥1 match); rare path, compute directly
      const z = evaluateCombo(bits, words, n, tiles, 1, [], planes);
      payout += (n - z.events) * zeroHitPay;
    }
    const res: ComboResult = {
      tiles: Array.from(tiles, (t) => t),
      events: r.events,
      rate: n > 0 ? r.events / n : 0,
      z: sd > 0 ? (r.events - n * p) / sd : 0,
      currentDrought: current,
      longestDrought: Math.max(r.longest, current),
      meanInterval: r.events > 1 ? r.sumIntervals / (r.events - 1) : NaN,
      overdueRatio: current / expectedInterval,
      droughtProbability: Math.pow(1 - p, current),
      rtp: n > 0 ? payout / n : NaN,
      best: params.sort === 'value' ? bestLevel() : null,
    };
    const s = scoreOf(res, params.sort);
    if (s > top.floor()) {
      res.best ??= bestLevel();
      top.push(s, res);
    }
  };

  if (exhaustive) {
    for (let i = 0; i < k; i++) combo[i] = i;
    const m = pool.length;
    for (;;) {
      evalCurrent();
      let i = k - 1;
      while (i >= 0 && combo[i] === m - k + i) i--;
      if (i < 0) break;
      combo[i]++;
      for (let j = i + 1; j < k; j++) combo[j] = combo[j - 1] + 1;
    }
  } else {
    const rnd = mulberry32(params.seed);
    const seen = new Set<string>();
    const idx = Array.from(pool, (_, i) => i);
    let attempts = 0;
    while (scanned < total && attempts < total * 4) {
      attempts++;
      // partial Fisher–Yates for a uniform k-subset
      for (let i = 0; i < k; i++) {
        const j = i + Math.floor(rnd() * (idx.length - i));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      const pick = idx.slice(0, k).sort((a, b) => a - b);
      const key = pick.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      for (let i = 0; i < k; i++) combo[i] = pick[i];
      evalCurrent();
    }
  }
  onProgress?.({ scanned, total });

  return {
    n,
    mode: exhaustive ? 'exhaustive' : 'sampled',
    space,
    scanned,
    expectedRate: p,
    expectedInterval,
    theoreticalRtp: theoreticalRtp(params.risk, k),
    results: top.sorted(),
    elapsedMs: performance.now() - t0,
  };
}
