/**
 * Stake bet-archive parser.
 *
 * Exports come in a few shapes (a bare array of bets, GraphQL-style
 * `{ data: { user: { houseBetList: [...] } } }`, `{ bet: { state } }` wrappers,
 * NDJSON...). Rather than hard-coding one shape, we walk the document and pick
 * out every object that carries a Keno game state, then validate each record
 * individually with Zod. A bad record is reported and skipped — it never takes
 * the whole file down.
 */
import { z } from 'zod';
import { isRisk, type Risk } from './payouts';
import type { NormalizedBet } from './dataset';

export const MAX_FILE_BYTES = 1024 * 1024 * 1024; // 1 GiB hard cap per file
const MAX_ISSUES_PER_FILE = 50;
const MAX_WALK_DEPTH = 10;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const distinct = (a: number[]) => new Set(a).size === a.length;

const square = z.number().int().min(0).max(40);

/** Schema for a candidate after field extraction; numbers are still in the file's own base. */
export const RawKenoBetSchema = z.object({
  betId: z.string().min(1).nullable(),
  time: z.number().finite().nullable(),
  nonce: z.number().int().nonnegative().nullable(),
  drawn: z.array(square).length(10, 'expected exactly 10 drawn numbers').refine(distinct, 'drawn numbers repeat'),
  selected: z
    .array(square)
    .min(1, 'no selected numbers')
    .max(10, 'more than 10 selected numbers')
    .refine(distinct, 'selected numbers repeat'),
  risk: z.custom<Risk>(isRisk, 'unknown risk level').nullable(),
  amount: z.number().finite().nonnegative().nullable(),
  payout: z.number().finite().nonnegative().nullable(),
  payoutMultiplier: z.number().finite().nonnegative().nullable(),
  currency: z.string().nullable(),
});
export type RawKenoBet = z.infer<typeof RawKenoBetSchema>;

export interface ParseIssue {
  record: number;
  reason: string;
}

export interface FileReport {
  name: string;
  size: number;
  candidates: number;
  accepted: number;
  rejected: number;
  nonKeno: number;
  issues: ParseIssue[];
  error: string | null;
}

export interface ParsedFile {
  report: FileReport;
  bets: (RawKenoBet & { sourceFile: string })[];
}

// ---------------------------------------------------------------- coercion

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function numArray(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' && x.trim() !== '' ? Number(x) : x));
  if (typeof v === 'string') {
    const parts = v.split(/[\s,;|]+/).filter(Boolean);
    return parts.map(Number);
  }
  return v;
}

/** Accepts ISO/RFC date strings, epoch seconds or epoch milliseconds. */
export function parseTime(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
  if (typeof v === 'string' && v.trim() !== '') {
    const asNum = Number(v);
    if (Number.isFinite(asNum)) return parseTime(asNum);
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function first(...vals: unknown[]): unknown {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

function gameName(o: Obj): string | null {
  const g = o.game;
  if (typeof g === 'string') return g.toLowerCase();
  if (isObj(g)) return str(first(g.slug, g.name, g.id))?.toLowerCase() ?? null;
  return null;
}

const DRAWN_KEYS = ['drawnNumbers', 'drawn_numbers', 'drawn', 'hits', 'result', 'results'];
const SELECTED_KEYS = ['selectedNumbers', 'selected_numbers', 'selected', 'picks', 'numbers', 'tiles'];

function pickKey(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}

/** Find the object that holds the Keno state, if `o` represents a Keno bet. */
function findState(o: Obj): { state: Obj; bet: Obj } | null {
  const layers: Obj[] = [o];
  if (isObj(o.bet)) layers.push(o.bet);
  for (const layer of layers) {
    for (const holder of [layer.state, layer.gameState, layer.game_state, layer]) {
      if (isObj(holder) && pickKey(holder, DRAWN_KEYS) !== undefined && pickKey(holder, SELECTED_KEYS) !== undefined) {
        return { state: holder, bet: layer };
      }
    }
  }
  return null;
}

/** Map a raw export object to the fields the schema validates. */
export function extractCandidate(outer: Obj, state: Obj, bet: Obj): Record<string, unknown> {
  const f = (k: string) => first(bet[k], outer[k]);
  return {
    betId: str(first(bet.id, outer.id, bet.iid, outer.iid, bet.betId, outer.betId, bet.bet_id)),
    time: parseTime(first(f('createdAt'), f('updatedAt'), f('created_at'), f('timestamp'), f('time'), f('date'))),
    nonce: num(first(f('nonce'), state.nonce)),
    drawn: numArray(pickKey(state, DRAWN_KEYS)),
    selected: numArray(pickKey(state, SELECTED_KEYS)),
    risk: (() => {
      const r = str(first(state.risk, f('risk')));
      return r ? r.toLowerCase() : null;
    })(),
    amount: num(f('amount')),
    payout: num(f('payout')),
    payoutMultiplier: num(first(f('payoutMultiplier'), f('payout_multiplier'), f('multiplier'))),
    currency: str(f('currency'))?.toLowerCase() ?? null,
  };
}

function looksLikeNonKenoBet(o: Obj): boolean {
  const layer = isObj(o.bet) ? o.bet : o;
  const g = gameName(layer) ?? gameName(o);
  return g !== null && g !== 'keno' && ('amount' in layer || 'payout' in layer || 'payoutMultiplier' in layer);
}

// ---------------------------------------------------------------- parsing

function parseJsonText(text: string): unknown {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(clean);
  } catch (err) {
    // NDJSON fallback: one bet per line
    const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length > 1) {
      const out: unknown[] = [];
      for (const line of lines) {
        try {
          out.push(JSON.parse(line));
        } catch {
          throw err;
        }
      }
      return out;
    }
    throw err;
  }
}

export function parseArchiveText(name: string, text: string): ParsedFile {
  const report: FileReport = {
    name,
    size: text.length,
    candidates: 0,
    accepted: 0,
    rejected: 0,
    nonKeno: 0,
    issues: [],
    error: null,
  };
  const bets: ParsedFile['bets'] = [];

  let doc: unknown;
  try {
    doc = parseJsonText(text);
  } catch (e) {
    report.error = `Invalid JSON: ${(e as Error).message}`;
    return { report, bets };
  }

  const issue = (reason: string) => {
    report.rejected++;
    if (report.issues.length < MAX_ISSUES_PER_FILE) report.issues.push({ record: report.candidates, reason });
  };

  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_WALK_DEPTH) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!isObj(node)) return;
    const found = findState(node);
    if (found) {
      report.candidates++;
      const g = gameName(found.bet) ?? gameName(node);
      if (g !== null && g !== 'keno') {
        report.nonKeno++;
        return;
      }
      const result = RawKenoBetSchema.safeParse(extractCandidate(node, found.state, found.bet));
      if (result.success) {
        report.accepted++;
        bets.push({ ...result.data, sourceFile: name });
      } else {
        const first = result.error.issues[0];
        issue(`${first.path.join('.') || 'record'}: ${first.message}`);
      }
      return;
    }
    if (looksLikeNonKenoBet(node)) {
      report.nonKeno++;
      return;
    }
    for (const v of Object.values(node)) if (typeof v === 'object' && v !== null) visit(v, depth + 1);
  };
  visit(doc, 0);

  if (report.candidates === 0 && report.nonKeno === 0) {
    report.error = 'No Keno bets found (expected objects with drawnNumbers + selectedNumbers).';
  }
  return { report, bets };
}

// ---------------------------------------------------------------- merging

export type NumberBase = 0 | 1;
export type NumberBaseSetting = 'auto' | NumberBase;

/**
 * Stake's API reports squares 0..39, but third-party exports sometimes use the
 * board labels 1..40. A 0 proves 0-based, a 40 proves 1-based. With ≥ 20 bets
 * the chance that neither appears is < 0.75²⁰ ≈ 0.3%, so detection is reliable;
 * ambiguous data defaults to Stake's native 0-based form.
 */
export function detectNumberBase(bets: RawKenoBet[]): { base: NumberBase; conclusive: boolean; conflicting: boolean } {
  let sawZero = false;
  let sawForty = false;
  for (const b of bets) {
    for (const x of b.drawn) {
      if (x === 0) sawZero = true;
      else if (x === 40) sawForty = true;
    }
    for (const x of b.selected) {
      if (x === 0) sawZero = true;
      else if (x === 40) sawForty = true;
    }
    if (sawZero && sawForty) break;
  }
  if (sawForty && !sawZero) return { base: 1, conclusive: true, conflicting: false };
  return { base: 0, conclusive: sawZero, conflicting: sawZero && sawForty };
}

export function dedupeKey(b: RawKenoBet): string {
  if (b.betId) return `id:${b.betId}`;
  return `t:${b.time ?? '-'}|n:${b.nonce ?? '-'}|d:${b.drawn.join(',')}|s:${[...b.selected].sort((x, y) => x - y).join(',')}`;
}

export interface MergeResult {
  bets: NormalizedBet[];
  duplicates: number;
  outOfRange: number;
  base: NumberBase;
  baseConclusive: boolean;
  baseConflicting: boolean;
  order: 'time' | 'nonce' | 'file';
}

/**
 * Merge parsed files: dedupe by bet id (or a content fingerprint), normalize to
 * 0-based squares, and sort chronologically (time, then nonce as tie-breaker).
 */
export function mergeParsed(files: ParsedFile[], baseSetting: NumberBaseSetting = 'auto'): MergeResult {
  const seen = new Set<string>();
  const unique: ParsedFile['bets'] = [];
  let duplicates = 0;
  for (const f of files) {
    for (const b of f.bets) {
      const key = dedupeKey(b);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      unique.push(b);
    }
  }

  const detected = detectNumberBase(unique);
  const base: NumberBase = baseSetting === 'auto' ? detected.base : baseSetting;

  let outOfRange = 0;
  const normalized: NormalizedBet[] = [];
  for (const b of unique) {
    const drawn = base === 1 ? b.drawn.map((x) => x - 1) : b.drawn;
    const selected = base === 1 ? b.selected.map((x) => x - 1) : b.selected;
    if (drawn.some((x) => x < 0 || x > 39) || selected.some((x) => x < 0 || x > 39)) {
      outOfRange++;
      continue;
    }
    normalized.push({
      key: dedupeKey(b),
      betId: b.betId,
      time: b.time,
      nonce: b.nonce,
      drawn,
      selected,
      risk: b.risk,
      amount: b.amount,
      payout: b.payout,
      payoutMultiplier: b.payoutMultiplier,
      currency: b.currency,
      sourceFile: b.sourceFile,
    });
  }

  let order: MergeResult['order'] = 'file';
  if (normalized.length > 0 && normalized.every((b) => b.time !== null)) {
    order = 'time';
    // Array.prototype.sort is stable, so equal timestamps keep file order unless nonce breaks the tie.
    normalized.sort((a, b) => a.time! - b.time! || (a.nonce ?? 0) - (b.nonce ?? 0));
  } else if (normalized.length > 0 && normalized.every((b) => b.nonce !== null)) {
    order = 'nonce';
    normalized.sort((a, b) => a.nonce! - b.nonce!);
  }

  return {
    bets: normalized,
    duplicates,
    outOfRange,
    base,
    baseConclusive: detected.conclusive,
    baseConflicting: detected.conflicting,
    order,
  };
}
