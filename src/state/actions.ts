/**
 * Side-effecting actions that talk to the workers. Components call these;
 * results flow back into the store.
 */
import { dataWorker, scanWorker } from '../workers/clients';
import { CancelledError } from '../workers/rpc';
import type { AnalyzeArgs, ArchiveSummary, ExportFormat, ExportKind, PfParams } from '../workers/api';
import type { NumberBaseSetting } from '../core/parser';
import type { SourceKind } from '../core/dataset';
import type { ScanParams } from '../core/scanner';
import { combosToCsv } from '../core/exporters';
import { sourceCount, useStore } from './store';

const get = useStore.getState;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function withTask<T>(label: string, fn: (onProgress: (p: { done: number; total: number; label?: string }) => void) => Promise<T>): Promise<T | undefined> {
  get().set({ task: { label, progress: null } });
  try {
    return await fn((progress) => get().set({ task: { label: progress.label ?? label, progress } }));
  } catch (e) {
    if (!(e instanceof CancelledError)) get().toast('error', errText(e));
    return undefined;
  } finally {
    get().set({ task: null });
  }
}

function applyArchive(summary: ArchiveSummary) {
  const s = get();
  const next: Partial<ReturnType<typeof get>> = {
    archive: summary.count > 0 || summary.files.length > 0 ? summary : null,
    ranges: { ...s.ranges, archive: { start: 0, end: summary.count - 1 } },
    dataVersion: s.dataVersion + 1,
    verify: null,
  };
  if (summary.count > 0 && (s.source !== 'archive' && !s.pf)) next.source = 'archive';
  if (summary.count === 0 && s.source === 'archive' && s.pf) next.source = 'pf';
  get().set(next);
}

export async function ingestFiles(files: File[]) {
  const json = files.filter((f) => /\.(json|ndjson|jsonl|txt)$/i.test(f.name) || f.type.includes('json'));
  const skipped = files.length - json.length;
  if (skipped > 0) get().toast('info', `Skipped ${skipped} non-JSON file${skipped > 1 ? 's' : ''}.`);
  if (json.length === 0) return;
  const before = get().archive?.count ?? 0;
  const summary = await withTask('Importing archives', (onProgress) => dataWorker.call('ingest', { files: json }, { onProgress }));
  if (!summary) return;
  applyArchive(summary);
  if (get().source !== 'archive' && summary.count > 0 && !get().pf) get().set({ source: 'archive' });
  const added = summary.count - before;
  const failed = summary.files.filter((f) => f.error).length;
  get().toast(
    failed ? 'error' : 'success',
    `${added.toLocaleString()} new bets merged (${summary.count.toLocaleString()} total, ${summary.duplicates.toLocaleString()} duplicates removed)` +
      (failed ? ` — ${failed} file${failed > 1 ? 's' : ''} failed` : ''),
  );
}

export async function removeFile(name: string) {
  const summary = await withTask('Removing file', () => dataWorker.call('removeFile', { name }));
  if (summary) applyArchive(summary);
}

export async function clearArchive() {
  const summary = await withTask('Clearing archive', () => dataWorker.call('clearArchive', {}));
  if (summary) applyArchive(summary);
}

export async function setNumberBase(base: NumberBaseSetting) {
  const summary = await withTask('Re-normalizing squares', () => dataWorker.call('setBase', { base }));
  if (summary) applyArchive(summary);
}

export async function generatePf(params: PfParams) {
  const summary = await withTask('Generating rounds', (onProgress) => dataWorker.call('generatePf', params, { onProgress }));
  if (!summary) return;
  const s = get();
  s.set({
    pf: summary,
    ranges: { ...s.ranges, pf: { start: 0, end: summary.count - 1 } },
    dataVersion: s.dataVersion + 1,
    source: s.archive ? s.source : 'pf',
    verify: null,
  });
  const check = summary.hashCheck.matches;
  get().toast(
    check === false ? 'error' : 'success',
    `${summary.count.toLocaleString()} rounds generated in ${summary.elapsedMs.toFixed(0)} ms` +
      (check === false ? ' — WARNING: server seed does not match the hashed seed!' : check ? ' — server seed hash verified ✓' : ''),
  );
}

export async function clearPf() {
  await dataWorker.call('clearPf', {});
  const s = get();
  s.set({ pf: null, verify: null, dataVersion: s.dataVersion + 1, source: s.archive ? 'archive' : s.source });
}

export function setSource(source: SourceKind) {
  get().set({ source });
}

export async function resolveTimeRange(from: number | null, to: number | null) {
  const { source } = get();
  try {
    const r = await dataWorker.call('timeToRange', { source, from, to });
    if (!r) {
      get().toast('info', 'No draws in that time window.');
      return;
    }
    get().setRange(source, r);
  } catch (e) {
    get().toast('error', errText(e));
  }
}

export function analyzeArgs(): AnalyzeArgs {
  const s = get();
  return {
    source: s.source,
    range: s.ranges[s.source],
    tiles: s.config.tiles,
    threshold: s.config.threshold,
    risk: s.config.risk,
    recentWindow: s.config.recentWindow,
    depth: s.config.depth,
  };
}

// ---------------------------------------------------------------- analysis scheduler

let inflight = false;
let pendingKey: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function analysisKey(): string | null {
  const s = get();
  if (sourceCount(s) === 0) return null;
  const a = analyzeArgs();
  return JSON.stringify([a, s.dataVersion]);
}

async function runAnalysis(key: string) {
  inflight = true;
  get().set({ analyzing: true });
  try {
    const result = await dataWorker.call('analyze', analyzeArgs());
    if (analysisKey() === key) get().set({ analysis: result, analysisError: null });
  } catch (e) {
    if (analysisKey() === key) get().set({ analysisError: errText(e) });
  } finally {
    inflight = false;
    const latest = analysisKey();
    if (latest !== null && latest !== key && pendingKey !== null) {
      pendingKey = null;
      void runAnalysis(latest);
    } else {
      pendingKey = null;
      get().set({ analyzing: false });
    }
  }
}

/**
 * Re-analyze whenever the source, window, config or data changes. Requests are
 * debounced and coalesced: while one analysis runs, further changes collapse
 * into a single follow-up with the latest parameters, so dragging the range
 * slider never queues up stale work.
 */
export function startAnalysisScheduler(): () => void {
  let lastKey: string | null = null;
  const onChange = () => {
    const key = analysisKey();
    if (key === lastKey) return;
    lastKey = key;
    if (key === null) {
      get().set({ analysis: null, analysisError: null });
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (inflight) pendingKey = key;
      else void runAnalysis(key);
    }, 60);
  };
  const unsub = useStore.subscribe(onChange);
  onChange();
  return () => {
    unsub();
    clearTimeout(timer);
  };
}

// ---------------------------------------------------------------- scanner

export function scanSignature(): string {
  const s = get();
  const c = s.config;
  return JSON.stringify([s.source, s.ranges[s.source], s.dataVersion, c.k, c.threshold, c.risk, c.depth, s.scanConfig]);
}

export function scanPool(): number[] {
  const s = get();
  const { poolMode, poolSize } = s.scanConfig;
  const tiles = s.analysis?.tiles.tiles;
  const all = Array.from({ length: 40 }, (_, i) => i);
  if (poolMode === 'all' || !tiles) return all;
  if (poolMode === 'selection') return [...s.config.tiles];
  const sorted = [...tiles].sort((a, b) =>
    poolMode === 'hot' ? b.z - a.z : poolMode === 'cold' ? a.z - b.z : b.overdueRatio - a.overdueRatio,
  );
  return sorted.slice(0, Math.max(s.config.k, poolSize)).map((t) => t.tile).sort((a, b) => a - b);
}

export async function runScan() {
  const s = get();
  const pool = scanPool();
  if (pool.length < s.config.k) {
    s.toast('error', `The pool has ${pool.length} tiles; K = ${s.config.k} needs at least ${s.config.k}.`);
    return;
  }
  const signature = scanSignature();
  const params: ScanParams = {
    k: s.config.k,
    threshold: s.config.threshold,
    pool,
    risk: s.config.risk,
    sort: s.scanConfig.sort,
    depth: s.config.depth,
    maxCombos: s.scanConfig.maxCombos,
    minEvents: s.scanConfig.minEvents,
    seed: s.scanConfig.seed,
  };
  s.set({ scan: { status: 'running', progress: null, result: null, error: null, signature } });
  try {
    const drawn = await dataWorker.call('scanInput', { source: s.source, range: s.ranges[s.source] });
    const result = await scanWorker.call(
      'scan',
      { drawn, params },
      {
        transfer: [drawn.buffer],
        onProgress: (progress) => get().set({ scan: { ...get().scan, progress } }),
      },
    );
    get().set({ scan: { status: 'done', progress: null, result, error: null, signature } });
  } catch (e) {
    if (e instanceof CancelledError) get().set({ scan: { status: 'idle', progress: null, result: null, error: null, signature: null } });
    else get().set({ scan: { status: 'error', progress: null, result: null, error: errText(e), signature } });
  }
}

export function cancelScan() {
  scanWorker.restart();
}

// ---------------------------------------------------------------- verify & export

export async function runVerify() {
  const s = get();
  const verify = await withTask('Verifying archive against seeds', () =>
    dataWorker.call('verify', { range: s.ranges.archive, depth: s.config.depth }),
  );
  if (verify) get().set({ verify });
}

export function downloadText(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportData(kind: ExportKind, format: ExportFormat) {
  const s = get();
  const file = await withTask('Preparing export', () =>
    dataWorker.call('export', { kind, format, source: kind === 'archive' ? 'archive' : s.source, range: s.ranges[kind === 'archive' ? 'archive' : s.source], analyze: analyzeArgs() }),
  );
  if (file) downloadText(file.filename, file.mime, file.content);
}

export function exportScan(format: ExportFormat) {
  const r = get().scan.result;
  if (!r) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (format === 'csv') downloadText(`keno-scan-${stamp}.csv`, 'text/csv', combosToCsv(r.results));
  else downloadText(`keno-scan-${stamp}.json`, 'application/json', JSON.stringify({ format: 'keno-scanner/scan@1', note: 'tiles are 0-indexed', ...r }, null, 1));
}
