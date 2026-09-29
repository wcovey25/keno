/** CSV / JSON serializers. Squares are exported as board labels (1..40). */
import { KENO_DRAWS } from './provablyFair';
import { RISKS } from './payouts';
import type { DrawColumns, Range } from './dataset';
import type { TileStat } from './stats';
import type { ComboResult } from './scanner';

export function csvCell(v: unknown): string {
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return '';
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(10))) : String(v);
  // Also guard against spreadsheet formula injection from untrusted archive strings.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v !== 'number' ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

const labels = (arr: ArrayLike<number>, from: number, count: number) => {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(arr[from + i] + 1);
  return out;
};

export interface DrawRow {
  index: number;
  time: string | null;
  nonce: number | null;
  drawn: number[];
  selected: number[];
  hits: number | null;
  risk: string | null;
  amount: number | null;
  payout: number | null;
  multiplier: number | null;
  currency: string | null;
}

const nn = (x: number) => (Number.isNaN(x) ? null : x);

export function drawRow(c: DrawColumns, i: number): DrawRow {
  const sel = labels(c.selected, i * KENO_DRAWS, c.selCount[i]);
  const drawn = labels(c.drawn, i * KENO_DRAWS, KENO_DRAWS);
  const drawnSet = new Set(drawn);
  return {
    index: i,
    time: Number.isNaN(c.time[i]) ? null : new Date(c.time[i]).toISOString(),
    nonce: nn(c.nonce[i]),
    drawn,
    selected: sel,
    hits: sel.length ? sel.filter((s) => drawnSet.has(s)).length : null,
    risk: c.risk[i] >= 0 ? RISKS[c.risk[i]] : null,
    amount: nn(c.amount[i]),
    payout: nn(c.payout[i]),
    multiplier: nn(c.payoutMult[i]),
    currency: c.currency[i] >= 0 ? c.currencies[c.currency[i]] : null,
  };
}

export function drawsToCsv(c: DrawColumns, r: Range): string {
  const header = ['index', 'time', 'nonce', 'drawn', 'selected', 'hits', 'risk', 'amount', 'payout', 'multiplier', 'currency'];
  const rows: unknown[][] = [];
  for (let i = r.start; i <= r.end; i++) {
    const d = drawRow(c, i);
    rows.push([d.index, d.time, d.nonce, d.drawn.join(' '), d.selected.join(' '), d.hits, d.risk, d.amount, d.payout, d.multiplier, d.currency]);
  }
  return toCsv(header, rows);
}

export function drawsToJson(c: DrawColumns, r: Range): string {
  const rows: DrawRow[] = [];
  for (let i = r.start; i <= r.end; i++) rows.push(drawRow(c, i));
  return JSON.stringify({ format: 'keno-scanner/draws@1', squares: '1-40', range: r, draws: rows }, null, 1);
}

export function tilesToCsv(tiles: TileStat[]): string {
  return toCsv(
    ['tile', 'count', 'rate', 'z', 'recent', 'recent_z', 'current_drought', 'longest_drought', 'mean_interval', 'interval_std', 'overdue_ratio'],
    tiles.map((t) => [t.tile + 1, t.count, t.rate, t.z, t.recent, t.recentZ, t.currentDrought, t.longestDrought, t.meanInterval, t.intervalStd, t.overdueRatio]),
  );
}

export function combosToCsv(rows: ComboResult[]): string {
  return toCsv(
    ['tiles', 'events', 'rate', 'z', 'current_drought', 'longest_drought', 'mean_interval', 'overdue_ratio', 'drought_probability', 'sim_rtp'],
    rows.map((r) => [r.tiles.map((t) => t + 1).join(' '), r.events, r.rate, r.z, r.currentDrought, r.longestDrought, r.meanInterval, r.overdueRatio, r.droughtProbability, r.rtp]),
  );
}
