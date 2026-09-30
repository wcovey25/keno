/// <reference lib="webworker" />
/**
 * Data worker — owns the datasets. Files are read and parsed here, provably
 * fair rounds are generated here, and every statistic is computed here, so the
 * UI thread only ever receives small, render-ready summaries.
 */
import { serve } from './rpc';
import type { AnalysisResult, ArchiveSummary, DataApi, PfSummary, VerifyResult } from './api';
import {
  clampRange,
  columnsFromBets,
  emptyColumns,
  lowerBoundTime,
  sliceDrawn,
  type DrawColumns,
  type NormalizedBet,
  type Range,
  type SourceKind,
} from '../core/dataset';
import {
  MAX_FILE_BYTES,
  mergeParsed,
  parseArchiveText,
  type MergeResult,
  type NumberBaseSetting,
  type ParsedFile,
} from '../core/parser';
import { KENO_DRAWS, checkServerSeedHash, createKenoGenerator } from '../core/provablyFair';
import { analyzeArchiveRtp, analyzeLevels, analyzeSet, analyzeTiles } from '../core/stats';
import { drawRow, drawsToCsv, drawsToJson, tilesToCsv } from '../core/exporters';

const MAX_PF_ROUNDS = 5_000_000;

const parsed = new Map<string, ParsedFile>();
let baseSetting: NumberBaseSetting = 'auto';
let archive: { bets: NormalizedBet[]; cols: DrawColumns; merge: MergeResult } | null = null;
let pf: { cols: DrawColumns; summary: PfSummary } | null = null;

function rebuildArchive(): ArchiveSummary {
  const merge = mergeParsed([...parsed.values()], baseSetting);
  archive = merge.bets.length > 0 ? { bets: merge.bets, cols: columnsFromBets(merge.bets), merge } : null;
  return archiveSummary(merge);
}

function archiveSummary(merge: MergeResult | null): ArchiveSummary {
  const bets = merge?.bets ?? [];
  const picks = new Array(11).fill(0);
  const risks: Record<string, number> = {};
  let nonceMin: number | null = null, nonceMax: number | null = null, withNonce = 0;
  let timeFrom: number | null = null, timeTo: number | null = null;
  for (const b of bets) {
    picks[b.selected.length]++;
    const r = b.risk ?? 'unknown';
    risks[r] = (risks[r] ?? 0) + 1;
    if (b.nonce !== null) {
      withNonce++;
      nonceMin = nonceMin === null ? b.nonce : Math.min(nonceMin, b.nonce);
      nonceMax = nonceMax === null ? b.nonce : Math.max(nonceMax, b.nonce);
    }
    if (b.time !== null) {
      timeFrom = timeFrom === null ? b.time : Math.min(timeFrom, b.time);
      timeTo = timeTo === null ? b.time : Math.max(timeTo, b.time);
    }
  }
  return {
    files: [...parsed.values()].map((f) => f.report),
    count: bets.length,
    duplicates: merge?.duplicates ?? 0,
    outOfRange: merge?.outOfRange ?? 0,
    base: merge?.base ?? 0,
    baseSetting,
    baseConclusive: merge?.baseConclusive ?? false,
    baseConflicting: merge?.baseConflicting ?? false,
    order: merge?.order ?? 'file',
    timeFrom,
    timeTo,
    nonceMin,
    nonceMax,
    withNonce,
    picks,
    risks,
  };
}

function columnsFor(source: SourceKind): DrawColumns {
  const c = source === 'archive' ? archive?.cols : pf?.cols;
  if (!c) throw new Error(source === 'archive' ? 'No archive loaded' : 'No provably fair rounds generated');
  return c;
}

function uniqueName(name: string): string {
  if (!parsed.has(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} (${i})`;
    if (!parsed.has(candidate)) return candidate;
  }
}

const finite = (x: number) => (Number.isNaN(x) ? null : x);

serve<DataApi>({
  async ingest({ files }, ctx) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = uniqueName(file.name);
      ctx.progress({ done: i, total: files.length, label: `Reading ${file.name}` });
      if (file.size > MAX_FILE_BYTES) {
        parsed.set(name, {
          bets: [],
          report: {
            name, size: file.size, candidates: 0, accepted: 0, rejected: 0, nonKeno: 0, issues: [],
            error: `File is ${(file.size / 2 ** 20).toFixed(0)} MiB; the limit is ${MAX_FILE_BYTES / 2 ** 20} MiB.`,
          },
        });
        continue;
      }
      let text: string;
      try {
        text = await file.text();
      } catch (e) {
        parsed.set(name, {
          bets: [],
          report: { name, size: file.size, candidates: 0, accepted: 0, rejected: 0, nonKeno: 0, issues: [], error: `Could not read file: ${(e as Error).message}` },
        });
        continue;
      }
      ctx.progress({ done: i + 0.5, total: files.length, label: `Parsing ${file.name}` });
      const result = parseArchiveText(name, text);
      result.report.size = file.size;
      parsed.set(name, result);
    }
    ctx.progress({ done: files.length, total: files.length, label: 'Merging' });
    return rebuildArchive();
  },

  removeFile({ name }) {
    parsed.delete(name);
    return rebuildArchive();
  },

  clearArchive() {
    parsed.clear();
    return rebuildArchive();
  },

  setBase({ base }) {
    baseSetting = base;
    return rebuildArchive();
  },

  generatePf({ serverSeed, hashedServerSeed, clientSeed, nonceStart, count }, ctx) {
    if (!serverSeed) throw new Error('Server seed is required (the revealed, unhashed seed).');
    if (!Number.isSafeInteger(nonceStart) || nonceStart < 0) throw new Error('Start nonce must be a non-negative integer.');
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Round count must be at least 1.');
    if (count > MAX_PF_ROUNDS) throw new Error(`At most ${MAX_PF_ROUNDS.toLocaleString()} rounds per generation.`);
    const t0 = performance.now();
    const gen = createKenoGenerator(serverSeed, clientSeed);
    const cols = emptyColumns(count);
    for (let i = 0; i < count; i++) {
      gen.drawInto(nonceStart + i, cols.drawn, i * KENO_DRAWS);
      cols.nonce[i] = nonceStart + i;
      if ((i & 0x3fff) === 0) ctx.progress({ done: i, total: count, label: 'Hashing rounds' });
    }
    const hashCheck = checkServerSeedHash(serverSeed, hashedServerSeed);
    const summary: PfSummary = {
      count,
      clientSeed,
      nonceStart,
      nonceEnd: nonceStart + count - 1,
      serverSeedHash: hashCheck.computed,
      hashCheck,
      elapsedMs: performance.now() - t0,
    };
    pf = { cols, summary };
    return summary;
  },

  clearPf() {
    pf = null;
    return null;
  },

  analyze(args): AnalysisResult {
    const t0 = performance.now();
    const c = columnsFor(args.source);
    const range = clampRange(args.range, c.n);
    if (range.end < range.start) throw new Error('Empty range');
    const tiles = analyzeTiles(c, range, Math.max(1, args.recentWindow), args.depth);
    const set =
      args.tiles.length >= 1 && args.tiles.length <= 10 && args.threshold >= 1 && args.threshold <= args.tiles.length
        ? analyzeSet(c, range, args.tiles, args.threshold, args.risk)
        : null;
    const archiveRtp = args.source === 'archive' ? analyzeArchiveRtp(c, range, args.depth) : null;
    return {
      source: args.source,
      range,
      timeFrom: finite(c.time[range.start]),
      timeTo: finite(c.time[range.end]),
      nonceFrom: finite(c.nonce[range.start]),
      nonceTo: finite(c.nonce[range.end]),
      tiles,
      set,
      archiveRtp,
      elapsedMs: performance.now() - t0,
    };
  },

  draws({ source, range, offset, limit }) {
    const c = columnsFor(source);
    const r = clampRange(range, c.n);
    const total = r.end - r.start + 1;
    const rows = [];
    // Newest first.
    for (let k = offset; k < Math.min(total, offset + limit); k++) rows.push(drawRow(c, r.end - k));
    return { total, rows };
  },

  scanInput({ source, range }, ctx) {
    const c = columnsFor(source);
    const drawn = sliceDrawn(c, clampRange(range, c.n));
    ctx.transfer(drawn.buffer);
    return drawn;
  },

  verify({ range, depth }): VerifyResult {
    if (!archive) throw new Error('Load a bet archive first.');
    if (!pf) throw new Error('Generate provably fair rounds first.');
    const a = archive.cols;
    const p = pf.cols;
    const { nonceStart } = pf.summary;
    const r = clampRange(range, a.n);
    const res: VerifyResult = {
      considered: r.end - r.start + 1, checked: 0, matched: 0, orderMatched: 0, mismatched: 0, noNonce: 0, outsidePf: 0,
      firstMatchIndex: null, lastMatchIndex: null, mismatches: [],
    };
    const inGen = new Uint8Array(40);
    for (let i = r.start; i <= r.end; i++) {
      const nonce = a.nonce[i];
      if (Number.isNaN(nonce)) { res.noNonce++; continue; }
      const j = nonce - nonceStart;
      if (j < 0 || j >= p.n) { res.outsidePf++; continue; }
      res.checked++;
      inGen.fill(0);
      let ordered = true, same = true;
      for (let m = 0; m < KENO_DRAWS; m++) {
        inGen[p.drawn[j * KENO_DRAWS + m]] = 1;
        if (p.drawn[j * KENO_DRAWS + m] !== a.drawn[i * KENO_DRAWS + m]) ordered = false;
      }
      for (let m = 0; m < KENO_DRAWS; m++) if (!inGen[a.drawn[i * KENO_DRAWS + m]]) same = false;
      if (same) {
        res.matched++;
        if (ordered) res.orderMatched++;
        res.firstMatchIndex ??= i;
        res.lastMatchIndex = i;
      } else {
        res.mismatched++;
        if (res.mismatches.length < depth) {
          res.mismatches.push({
            index: i,
            nonce,
            betId: archive.bets[i].betId,
            archive: Array.from(a.drawn.subarray(i * KENO_DRAWS, (i + 1) * KENO_DRAWS)),
            generated: Array.from(p.drawn.subarray(j * KENO_DRAWS, (j + 1) * KENO_DRAWS)),
          });
        }
      }
    }
    return res;
  },

  comboDetail({ source, range, tiles, risk }) {
    const c = columnsFor(source);
    const r = clampRange(range, c.n);
    if (tiles.length < 1 || tiles.length > 10) throw new Error('Pick 1–10 tiles');
    const levels = analyzeLevels(c, r, tiles, risk);
    const scored = levels.filter((l) => !Number.isNaN(l.score));
    const threshold = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)).m : Math.ceil(tiles.length / 2);
    return { tiles, risk, n: r.end - r.start + 1, levels, set: analyzeSet(c, r, tiles, threshold, risk), threshold };
  },

  timeToRange({ source, from, to }): Range | null {
    const c = columnsFor(source);
    if (c.n === 0 || Number.isNaN(c.time[0])) return null;
    const start = from === null ? 0 : lowerBoundTime(c, from);
    const end = to === null ? c.n - 1 : lowerBoundTime(c, to + 1) - 1;
    if (start > end) return null;
    return { start, end };
  },

  export({ kind, format, source, range, analyze: analyzeArgs }) {
    const c = columnsFor(source);
    const r = clampRange(range, c.n);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `keno-${source}-${r.start}-${r.end}-${stamp}`;
    switch (kind) {
      case 'draws':
        return format === 'csv'
          ? { filename: `${base}-draws.csv`, mime: 'text/csv', content: drawsToCsv(c, r) }
          : { filename: `${base}-draws.json`, mime: 'application/json', content: drawsToJson(c, r) };
      case 'tiles': {
        const t = analyzeTiles(c, r, analyzeArgs.recentWindow, analyzeArgs.depth);
        return format === 'csv'
          ? { filename: `${base}-tiles.csv`, mime: 'text/csv', content: tilesToCsv(t.tiles) }
          : { filename: `${base}-tiles.json`, mime: 'application/json', content: JSON.stringify(t, null, 1) };
      }
      case 'analysis': {
        const t = analyzeTiles(c, r, analyzeArgs.recentWindow, analyzeArgs.depth);
        const set = analyzeArgs.tiles.length ? analyzeSet(c, r, analyzeArgs.tiles, analyzeArgs.threshold, analyzeArgs.risk) : null;
        const rtp = source === 'archive' ? analyzeArchiveRtp(c, r, analyzeArgs.depth) : null;
        const payload = {
          format: 'keno-scanner/analysis@1',
          generatedAt: new Date().toISOString(),
          note: 'Tile numbers in this file are 0-indexed (0 = board square 1).',
          source,
          range: r,
          config: { ...analyzeArgs, range: undefined },
          provablyFair: source === 'pf' ? pf?.summary : undefined,
          tiles: t,
          set,
          archiveRtp: rtp,
        };
        return { filename: `${base}-analysis.json`, mime: 'application/json', content: JSON.stringify(payload, null, 1) };
      }
      case 'archive': {
        if (!archive) throw new Error('No archive loaded');
        // Merged, deduplicated backup in Stake-like shape (0-indexed squares, as the API uses).
        const bets = archive.bets.slice(r.start, r.end + 1).map((b) => ({
          id: b.betId,
          nonce: b.nonce,
          createdAt: b.time === null ? null : new Date(b.time).toISOString(),
          game: 'keno',
          amount: b.amount,
          payout: b.payout,
          payoutMultiplier: b.payoutMultiplier,
          currency: b.currency,
          state: { risk: b.risk, drawnNumbers: b.drawn, selectedNumbers: b.selected },
        }));
        return { filename: `keno-archive-merged-${stamp}.json`, mime: 'application/json', content: JSON.stringify(bets) };
      }
    }
  },
});

