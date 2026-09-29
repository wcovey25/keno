/**
 * Columnar draw storage. Everything the analytics engine touches is a typed
 * array so a million-round dataset stays compact (~10 bytes/draw for the board)
 * and can be transferred between workers without serialization cost.
 */
import { RISKS, type Risk } from './payouts';
import { KENO_DRAWS } from './provablyFair';

export type SourceKind = 'archive' | 'pf';

/** A validated, normalized Stake Keno bet from an archive export. Squares are 0-indexed. */
export interface NormalizedBet {
  key: string;
  betId: string | null;
  time: number | null;
  nonce: number | null;
  drawn: number[];
  selected: number[];
  risk: Risk | null;
  amount: number | null;
  payout: number | null;
  payoutMultiplier: number | null;
  currency: string | null;
  sourceFile: string;
}

export interface DrawColumns {
  n: number;
  /** n × 10 drawn squares, 0-indexed, in draw order. */
  drawn: Uint8Array;
  nonce: Float64Array;
  time: Float64Array;
  /** Picks per bet (0 for generated provably-fair rounds). */
  selCount: Uint8Array;
  /** n × 10 selected squares; only the first selCount[i] are meaningful. */
  selected: Uint8Array;
  /** Index into RISKS, −1 when unknown. */
  risk: Int8Array;
  amount: Float64Array;
  payout: Float64Array;
  payoutMult: Float64Array;
  /** Index into `currencies`, −1 when unknown. */
  currency: Int16Array;
  currencies: string[];
}

export function emptyColumns(n: number): DrawColumns {
  return {
    n,
    drawn: new Uint8Array(n * KENO_DRAWS),
    nonce: new Float64Array(n).fill(NaN),
    time: new Float64Array(n).fill(NaN),
    selCount: new Uint8Array(n),
    selected: new Uint8Array(n * KENO_DRAWS),
    risk: new Int8Array(n).fill(-1),
    amount: new Float64Array(n).fill(NaN),
    payout: new Float64Array(n).fill(NaN),
    payoutMult: new Float64Array(n).fill(NaN),
    currency: new Int16Array(n).fill(-1),
    currencies: [],
  };
}

export function columnsFromBets(bets: NormalizedBet[]): DrawColumns {
  const c = emptyColumns(bets.length);
  const currencyIndex = new Map<string, number>();
  for (let i = 0; i < bets.length; i++) {
    const b = bets[i];
    for (let j = 0; j < KENO_DRAWS; j++) c.drawn[i * KENO_DRAWS + j] = b.drawn[j];
    c.selCount[i] = b.selected.length;
    for (let j = 0; j < b.selected.length; j++) c.selected[i * KENO_DRAWS + j] = b.selected[j];
    if (b.nonce !== null) c.nonce[i] = b.nonce;
    if (b.time !== null) c.time[i] = b.time;
    if (b.risk !== null) c.risk[i] = RISKS.indexOf(b.risk);
    if (b.amount !== null) c.amount[i] = b.amount;
    if (b.payout !== null) c.payout[i] = b.payout;
    if (b.payoutMultiplier !== null) c.payoutMult[i] = b.payoutMultiplier;
    if (b.currency !== null) {
      let idx = currencyIndex.get(b.currency);
      if (idx === undefined) {
        idx = c.currencies.length;
        c.currencies.push(b.currency);
        currencyIndex.set(b.currency, idx);
      }
      c.currency[i] = idx;
    }
  }
  return c;
}

/** Inclusive index window [start, end] clamped to the dataset. */
export interface Range {
  start: number;
  end: number;
}

export function clampRange(r: Range, n: number): Range {
  if (n === 0) return { start: 0, end: -1 };
  const start = Math.max(0, Math.min(n - 1, Math.floor(r.start)));
  const end = Math.max(start, Math.min(n - 1, Math.floor(r.end)));
  return { start, end };
}

/** Copy of the drawn squares within a range (for the scanner worker). */
export function sliceDrawn(c: DrawColumns, r: Range): Uint8Array {
  return c.drawn.slice(r.start * KENO_DRAWS, (r.end + 1) * KENO_DRAWS);
}

/** First index whose time ≥ t (times must be non-decreasing). */
export function lowerBoundTime(c: DrawColumns, t: number): number {
  let lo = 0, hi = c.n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (c.time[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
