/**
 * Statistical engine. Every function works on the columnar dataset over an
 * inclusive index window, is pure, and runs in O(n·10) or O(n·k) — they are
 * executed inside the data worker so the UI thread never blocks.
 *
 * Conventions for "gaps" (used for tiles, tile sets and scanner combos):
 *   interval  = distance between consecutive qualifying draws (1 = back-to-back)
 *   drought   = consecutive non-qualifying draws (interval − 1, plus the leading
 *               run before the first hit and the trailing run after the last)
 *   current   = trailing drought (draws since the last qualifying draw)
 */
import { KENO_DRAWS, KENO_SQUARES } from './provablyFair';
import {
  RISKS,
  atLeastProbability,
  hitDistribution,
  multiplierFor,
  payoutRow,
  payoutStdDev,
  theoreticalRtp,
  type Risk,
} from './payouts';
import { RunningStats, chiSquarePValue, downsample } from './mathx';
import type { DrawColumns, Range } from './dataset';

const P_TILE = KENO_DRAWS / KENO_SQUARES; // 0.25
const SERIES_POINTS = 600;

// ---------------------------------------------------------------- gap tracking

export interface GapSummary {
  events: number;
  rate: number;
  expectedRate: number;
  /** (observed − expected) / sd under the binomial model. */
  z: number;
  currentDrought: number;
  longestDrought: number;
  meanInterval: number;
  intervalStd: number;
  expectedInterval: number;
  /** currentDrought / expectedInterval — > 1 means "overdue". */
  overdueRatio: number;
  /** Probability of a drought at least this long, (1 − p)^current. */
  droughtProbability: number;
}

export class GapTracker {
  private last = -1;
  private first = -1;
  private longest = 0;
  private readonly intervals = new RunningStats();
  events = 0;

  /** Record a qualifying event at position `i` (0-based within the window, increasing). */
  hit(i: number): void {
    if (this.last >= 0) {
      const interval = i - this.last;
      this.intervals.push(interval);
      if (interval - 1 > this.longest) this.longest = interval - 1;
    } else {
      this.first = i;
      if (i > this.longest) this.longest = i;
    }
    this.last = i;
    this.events++;
  }

  summary(n: number, p: number): GapSummary {
    const current = this.last < 0 ? n : n - 1 - this.last;
    const longest = Math.max(this.longest, current);
    const expected = n * p;
    const sd = Math.sqrt(n * p * (1 - p));
    const expectedInterval = p > 0 ? 1 / p : Infinity;
    return {
      events: this.events,
      rate: n > 0 ? this.events / n : 0,
      expectedRate: p,
      z: sd > 0 ? (this.events - expected) / sd : 0,
      currentDrought: current,
      longestDrought: longest,
      meanInterval: this.intervals.n > 0 ? this.intervals.mean : NaN,
      intervalStd: this.intervals.n > 1 ? this.intervals.std : NaN,
      expectedInterval,
      overdueRatio: current / expectedInterval,
      droughtProbability: Math.pow(1 - p, current),
    };
  }

  get firstIndex(): number {
    return this.first;
  }
}

// ---------------------------------------------------------------- tiles

export interface TileStat extends GapSummary {
  tile: number;
  count: number;
  recent: number;
  recentZ: number;
}

export interface PairStat {
  a: number;
  b: number;
  count: number;
  z: number;
}

export interface TileAnalysis {
  n: number;
  tiles: TileStat[];
  /** χ² uniformity statistic, corrected for drawing 10 of 40 without replacement. */
  chi2: number;
  chi2P: number;
  df: number;
  recentWindow: number;
  rows: { index: number; count: number; expected: number }[];
  cols: { index: number; count: number; expected: number }[];
  topPairs: PairStat[];
  coldPairs: PairStat[];
  /** Mean sum of board labels (1..40) per draw; expected 205. */
  meanSum: number;
  meanOdd: number;
  /** Mean number of squares repeated from the previous draw; expected 2.5. */
  meanRepeats: number;
}

export function analyzeTiles(c: DrawColumns, r: Range, recentWindow: number, pairDepth = 15): TileAnalysis {
  const n = r.end - r.start + 1;
  const counts = new Float64Array(KENO_SQUARES);
  const recent = new Float64Array(KENO_SQUARES);
  const trackers = Array.from({ length: KENO_SQUARES }, () => new GapTracker());
  const pairs = new Float64Array(KENO_SQUARES * KENO_SQUARES);
  const recentStart = Math.max(r.start, r.end - recentWindow + 1);
  const recentN = r.end - recentStart + 1;
  const prev = new Uint8Array(KENO_SQUARES);
  const cur = new Uint8Array(KENO_SQUARES);
  let sum = 0, odd = 0, repeats = 0;
  const d = c.drawn;

  for (let i = r.start; i <= r.end; i++) {
    const base = i * KENO_DRAWS;
    const pos = i - r.start;
    cur.fill(0);
    for (let j = 0; j < KENO_DRAWS; j++) {
      const t = d[base + j];
      counts[t]++;
      trackers[t].hit(pos);
      if (i >= recentStart) recent[t]++;
      sum += t + 1;
      if ((t + 1) & 1) odd++;
      if (prev[t]) repeats++;
      cur[t] = 1;
      for (let m = 0; m < j; m++) {
        const u = d[base + m];
        pairs[t < u ? t * KENO_SQUARES + u : u * KENO_SQUARES + t]++;
      }
    }
    prev.set(cur);
  }

  const tiles: TileStat[] = [];
  let ss = 0;
  const expected = n * P_TILE;
  const recentExpected = recentN * P_TILE;
  const recentSd = Math.sqrt(recentN * P_TILE * (1 - P_TILE));
  for (let t = 0; t < KENO_SQUARES; t++) {
    ss += (counts[t] - expected) ** 2;
    tiles.push({
      tile: t,
      count: counts[t],
      recent: recent[t],
      recentZ: recentSd > 0 ? (recent[t] - recentExpected) / recentSd : 0,
      ...trackers[t].summary(n, P_TILE),
    });
  }
  // Indicator covariance for 10-of-40 sampling is p(1−p)·M/(M−1)·(I − J/M), so
  // Σ(O−E)² / [n·p(1−p)·M/(M−1)] ~ χ²(M−1).
  const df = KENO_SQUARES - 1;
  const chi2 = n > 0 ? (ss * (KENO_SQUARES - 1)) / (n * P_TILE * (1 - P_TILE) * KENO_SQUARES) : 0;

  // Board is 8 columns × 5 rows.
  const rows = Array.from({ length: 5 }, (_, i) => ({ index: i, count: 0, expected: expected * 8 }));
  const cols = Array.from({ length: 8 }, (_, i) => ({ index: i, count: 0, expected: expected * 5 }));
  for (let t = 0; t < KENO_SQUARES; t++) {
    rows[Math.floor(t / 8)].count += counts[t];
    cols[t % 8].count += counts[t];
  }

  // Pair co-occurrence: P(both drawn) = (10·9)/(40·39).
  const pPair = (KENO_DRAWS * (KENO_DRAWS - 1)) / (KENO_SQUARES * (KENO_SQUARES - 1));
  const pairSd = Math.sqrt(n * pPair * (1 - pPair));
  const allPairs: PairStat[] = [];
  for (let a = 0; a < KENO_SQUARES; a++) {
    for (let b = a + 1; b < KENO_SQUARES; b++) {
      const cnt = pairs[a * KENO_SQUARES + b];
      allPairs.push({ a, b, count: cnt, z: pairSd > 0 ? (cnt - n * pPair) / pairSd : 0 });
    }
  }
  allPairs.sort((x, y) => y.count - x.count || x.a - y.a || x.b - y.b);

  return {
    n,
    tiles,
    chi2,
    chi2P: n > 0 ? chiSquarePValue(chi2, df) : NaN,
    df,
    recentWindow: recentN,
    rows,
    cols,
    topPairs: allPairs.slice(0, pairDepth),
    coldPairs: allPairs.slice(-pairDepth).reverse(),
    meanSum: n > 0 ? sum / n : NaN,
    meanOdd: n > 0 ? odd / n : NaN,
    meanRepeats: n > 1 ? repeats / (n - 1) : NaN,
  };
}

// ---------------------------------------------------------------- tile-set tracker

export interface Series {
  x: number[];
  y: number[];
}

export interface SetAnalysis {
  tiles: number[];
  k: number;
  threshold: number;
  risk: Risk;
  n: number;
  histogram: number[];
  expectedProb: number[];
  distChi2: number;
  distChi2P: number;
  distDf: number;
  gaps: GapSummary;
  sim: {
    rtp: number;
    theoreticalRtp: number;
    /** Normal-approximation 95% interval for RTP under a fair game, given n bets (floored at 0). */
    ciLow: number;
    ciHigh: number;
    netUnits: number;
    maxDrawdown: number;
    winRate: number;
    bestMultiplier: number;
    series: Series;
  };
  recentMatches: number[];
}

/** χ² goodness of fit, pooling adjacent bins until each expected count ≥ 5. */
export function pooledChiSquare(observed: number[], probs: number[], n: number): { chi2: number; df: number; p: number } {
  const bins: { o: number; e: number }[] = [];
  let o = 0, e = 0;
  for (let i = 0; i < observed.length; i++) {
    o += observed[i];
    e += probs[i] * n;
    if (e >= 5) {
      bins.push({ o, e });
      o = 0;
      e = 0;
    }
  }
  if (e > 0 || o > 0) {
    if (bins.length > 0) {
      bins[bins.length - 1].o += o;
      bins[bins.length - 1].e += e;
    } else bins.push({ o, e });
  }
  const chi2 = bins.reduce((s, b) => s + (b.e > 0 ? (b.o - b.e) ** 2 / b.e : 0), 0);
  const df = bins.length - 1;
  return { chi2, df, p: df > 0 ? chiSquarePValue(chi2, df) : NaN };
}

export function analyzeSet(
  c: DrawColumns,
  r: Range,
  tiles: number[],
  threshold: number,
  risk: Risk,
): SetAnalysis {
  const k = tiles.length;
  const n = r.end - r.start + 1;
  const member = new Uint8Array(KENO_SQUARES);
  for (const t of tiles) member[t] = 1;
  const row = payoutRow(risk, k);
  const histogram = new Array<number>(k + 1).fill(0);
  const tracker = new GapTracker();
  const profit = new Float64Array(Math.max(0, n));
  let net = 0, peak = 0, maxDD = 0, wins = 0, best = 0, returned = 0;
  const recentMatches: number[] = [];
  const recentFrom = r.end - 59;

  for (let i = r.start; i <= r.end; i++) {
    const base = i * KENO_DRAWS;
    let m = 0;
    for (let j = 0; j < KENO_DRAWS; j++) m += member[c.drawn[base + j]];
    histogram[m]++;
    const pos = i - r.start;
    if (m >= threshold) tracker.hit(pos);
    const mult = row[m];
    returned += mult;
    if (mult > 1) wins++;
    if (mult > best) best = mult;
    net += mult - 1;
    profit[pos] = net;
    if (net > peak) peak = net;
    if (peak - net > maxDD) maxDD = peak - net;
    if (i >= recentFrom) recentMatches.push(m);
  }

  const expectedProb = hitDistribution(k);
  const dist = pooledChiSquare(histogram, expectedProb, n);
  const theo = theoreticalRtp(risk, k);
  const se = n > 0 ? payoutStdDev(risk, k) / Math.sqrt(n) : NaN;

  return {
    tiles: [...tiles],
    k,
    threshold,
    risk,
    n,
    histogram,
    expectedProb,
    distChi2: dist.chi2,
    distChi2P: dist.p,
    distDf: dist.df,
    gaps: tracker.summary(n, atLeastProbability(k, threshold)),
    sim: {
      rtp: n > 0 ? returned / n : NaN,
      theoreticalRtp: theo,
      ciLow: Math.max(0, theo - 1.96 * se),
      ciHigh: theo + 1.96 * se,
      netUnits: net,
      maxDrawdown: maxDD,
      winRate: n > 0 ? wins / n : NaN,
      bestMultiplier: best,
      series: downsample(profit, SERIES_POINTS),
    },
    recentMatches,
  };
}

// ---------------------------------------------------------------- archive RTP

export interface RtpGroup {
  risk: Risk | 'unknown';
  picks: number;
  bets: number;
  rtp: number;
  theoreticalRtp: number;
  ciLow: number;
  ciHigh: number;
  wins: number;
  histogram: number[];
  expectedProb: number[];
}

export interface CurrencyRow {
  currency: string;
  bets: number;
  wagered: number;
  returned: number;
  profit: number;
  rtp: number;
}

export interface ArchiveRtp {
  bets: number;
  scored: number;
  derivedMultipliers: number;
  rtp: number;
  theoreticalRtp: number;
  netUnits: number;
  maxDrawdown: number;
  winRate: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
  groups: RtpGroup[];
  currencies: CurrencyRow[];
  series: Series;
  mismatches: { index: number; reported: number; expected: number }[];
  mismatchCount: number;
  topWins: { index: number; multiplier: number; hits: number; picks: number; risk: string }[];
}

/**
 * Actual RTP of real bets. Returns are measured in bet units (payout multiplier),
 * which is currency-agnostic; per-currency weighted RTP is reported separately.
 * When an export omits the multiplier it is derived from the payout table.
 */
export function analyzeArchiveRtp(c: DrawColumns, r: Range, depth: number): ArchiveRtp {
  const groups = new Map<string, RtpGroup & { sum: number }>();
  const currencies = new Map<number, CurrencyRow>();
  const n = Math.max(0, r.end - r.start + 1);
  const profit: number[] = [];
  const mismatches: ArchiveRtp['mismatches'] = [];
  const topWins: ArchiveRtp['topWins'] = [];
  const member = new Uint8Array(KENO_SQUARES);
  let scored = 0, derived = 0, sum = 0, theoSum = 0, theoN = 0, net = 0, peak = 0, maxDD = 0, wins = 0;
  let winStreak = 0, lossStreak = 0, longestWin = 0, longestLoss = 0, mismatchCount = 0;

  for (let i = r.start; i <= r.end; i++) {
    const picks = c.selCount[i];
    if (picks === 0) continue;
    member.fill(0);
    for (let j = 0; j < picks; j++) member[c.selected[i * KENO_DRAWS + j]] = 1;
    let hits = 0;
    for (let j = 0; j < KENO_DRAWS; j++) hits += member[c.drawn[i * KENO_DRAWS + j]];
    const riskIdx = c.risk[i];
    const risk = riskIdx >= 0 ? RISKS[riskIdx] : null;

    let mult = c.payoutMult[i];
    if (Number.isNaN(mult) && !Number.isNaN(c.payout[i]) && c.amount[i] > 0) mult = c.payout[i] / c.amount[i];
    const tableMult = risk ? multiplierFor(risk, picks, hits) : NaN;
    if (Number.isNaN(mult) && risk) {
      mult = tableMult;
      derived++;
    } else if (risk && Math.abs(mult - tableMult) > 1e-6 * Math.max(1, tableMult)) {
      mismatchCount++;
      if (mismatches.length < depth) mismatches.push({ index: i, reported: mult, expected: tableMult });
    }
    if (Number.isNaN(mult)) continue;

    scored++;
    sum += mult;
    if (risk) {
      theoSum += theoreticalRtp(risk, picks);
      theoN++;
    }
    net += mult - 1;
    profit.push(net);
    if (net > peak) peak = net;
    if (peak - net > maxDD) maxDD = peak - net;
    if (mult > 1) {
      wins++;
      winStreak++;
      lossStreak = 0;
      if (winStreak > longestWin) longestWin = winStreak;
    } else {
      lossStreak++;
      winStreak = 0;
      if (lossStreak > longestLoss) longestLoss = lossStreak;
    }

    const gk = `${risk ?? 'unknown'}:${picks}`;
    let g = groups.get(gk);
    if (!g) {
      g = {
        risk: risk ?? 'unknown',
        picks,
        bets: 0,
        rtp: 0,
        theoreticalRtp: risk ? theoreticalRtp(risk, picks) : NaN,
        ciLow: NaN,
        ciHigh: NaN,
        wins: 0,
        histogram: new Array(picks + 1).fill(0),
        expectedProb: hitDistribution(picks),
        sum: 0,
      };
      groups.set(gk, g);
    }
    g.bets++;
    g.sum += mult;
    g.histogram[hits]++;
    if (mult > 1) g.wins++;

    const cur = c.currency[i];
    const amount = c.amount[i];
    if (cur >= 0 && !Number.isNaN(amount)) {
      let row = currencies.get(cur);
      if (!row) {
        row = { currency: c.currencies[cur], bets: 0, wagered: 0, returned: 0, profit: 0, rtp: NaN };
        currencies.set(cur, row);
      }
      row.bets++;
      row.wagered += amount;
      row.returned += Number.isNaN(c.payout[i]) ? amount * mult : c.payout[i];
    }

    if (mult > 1) {
      topWins.push({ index: i, multiplier: mult, hits, picks, risk: risk ?? 'unknown' });
      if (topWins.length > depth * 4) {
        topWins.sort((a, b) => b.multiplier - a.multiplier);
        topWins.length = depth;
      }
    }
  }
  topWins.sort((a, b) => b.multiplier - a.multiplier);
  topWins.length = Math.min(topWins.length, depth);

  const groupRows: RtpGroup[] = [...groups.values()]
    .map(({ sum: s, ...g }) => {
      const se = g.risk !== 'unknown' ? payoutStdDev(g.risk, g.picks) / Math.sqrt(g.bets) : NaN;
      return { ...g, rtp: s / g.bets, ciLow: Math.max(0, g.theoreticalRtp - 1.96 * se), ciHigh: g.theoreticalRtp + 1.96 * se };
    })
    .sort((a, b) => b.bets - a.bets);

  const currencyRows = [...currencies.values()].map((row) => ({
    ...row,
    profit: row.returned - row.wagered,
    rtp: row.wagered > 0 ? row.returned / row.wagered : NaN,
  }));
  currencyRows.sort((a, b) => b.bets - a.bets);

  return {
    bets: n,
    scored,
    derivedMultipliers: derived,
    rtp: scored > 0 ? sum / scored : NaN,
    theoreticalRtp: theoN > 0 ? theoSum / theoN : NaN,
    netUnits: net,
    maxDrawdown: maxDD,
    winRate: scored > 0 ? wins / scored : NaN,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    currentStreak: winStreak > 0 ? winStreak : -lossStreak,
    groups: groupRows,
    currencies: currencyRows,
    series: downsample(profit, SERIES_POINTS),
    mismatches,
    mismatchCount,
    topWins,
  };
}

// ---------------------------------------------------------------- per-level combo detail

export interface LevelStat {
  m: number;
  payout: number;
  probability: number;
  expectedInterval: number;
  expectedHits: number;
  events: number;
  currentDrought: number;
  longestDrought: number;
  meanInterval: number;
  overdue: number;
  luck: number;
  /** Value score (see scanner.ts `valueScore`); NaN for levels that do not return a profit. */
  score: number;
}

/** For a tile set, drought / luck statistics for every "≥ M matched" level, M = 1..k. */
export function analyzeLevels(c: DrawColumns, r: Range, tiles: number[], risk: Risk): LevelStat[] {
  const k = tiles.length;
  const n = r.end - r.start + 1;
  const member = new Uint8Array(KENO_SQUARES);
  for (const t of tiles) member[t] = 1;
  const trackers = Array.from({ length: k + 1 }, () => new GapTracker());
  for (let i = r.start; i <= r.end; i++) {
    let m = 0;
    for (let j = 0; j < KENO_DRAWS; j++) m += member[c.drawn[i * KENO_DRAWS + j]];
    for (let lv = 1; lv <= m; lv++) trackers[lv].hit(i - r.start);
  }
  const row = payoutRow(risk, k);
  const out: LevelStat[] = [];
  for (let m = 1; m <= k; m++) {
    const p = atLeastProbability(k, m);
    const g = trackers[m].summary(n, p);
    const expectedHits = n * p;
    const reliability = Math.min(1, expectedHits / 5);
    const rarity = 1 + Math.log10(Math.max(1, g.expectedInterval)) / 2;
    out.push({
      m,
      payout: row[m],
      probability: p,
      expectedInterval: g.expectedInterval,
      expectedHits,
      events: g.events,
      currentDrought: g.currentDrought,
      longestDrought: g.longestDrought,
      meanInterval: g.meanInterval,
      overdue: g.overdueRatio,
      luck: expectedHits > 0 ? g.events / expectedHits : NaN,
      score: row[m] > 1 ? g.overdueRatio * Math.log2(1 + row[m]) * reliability * rarity : NaN,
    });
  }
  return out;
}
