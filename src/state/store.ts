/**
 * UI state (zustand). The store holds only small, render-ready data: dataset
 * summaries, the analysis window, configuration and worker results. All heavy
 * data lives inside the data worker.
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { Range, SourceKind } from '../core/dataset';
import type { Risk } from '../core/payouts';
import type { ScanResult, ScanSort } from '../core/scanner';
import type { AnalysisResult, ArchiveSummary, PfSummary, VerifyResult } from '../workers/api';
import type { Progress } from '../workers/rpc';
import { sfx } from '../lib/sfx';

export const TABS = ['overview', 'tiles', 'overdue', 'scanner', 'rtp', 'verify', 'log', 'export'] as const;
export type TabId = (typeof TABS)[number];

export interface Config {
  k: number;
  risk: Risk;
  depth: number;
  threshold: number;
  tiles: number[];
  recentWindow: number;
}

export type PoolMode = 'all' | 'hot' | 'cold' | 'overdue' | 'selection';

export interface ScanConfig {
  sort: ScanSort;
  poolMode: PoolMode;
  poolSize: number;
  maxCombos: number;
  minEvents: number;
  seed: number;
}

export interface ScanState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: Progress | null;
  result: ScanResult | null;
  error: string | null;
  /** Snapshot of what the result was computed on, to flag stale results. */
  signature: string | null;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

export interface Task {
  label: string;
  progress: Progress | null;
}

export type UiMode = 'standard' | 'advanced';

interface State {
  mode: UiMode;
  sound: boolean;
  welcomeAccepted: boolean;
  /** Standard mode's auto-run "Top Picks" scan. */
  picks: ScanState;
  /** Combination shown in the detail modal. */
  detail: { tiles: number[] } | null;
  source: SourceKind;
  archive: ArchiveSummary | null;
  pf: PfSummary | null;
  ranges: Record<SourceKind, Range>;
  config: Config;
  scanConfig: ScanConfig;
  scan: ScanState;
  analysis: AnalysisResult | null;
  analysisError: string | null;
  analyzing: boolean;
  verify: VerifyResult | null;
  task: Task | null;
  tab: TabId;
  toasts: Toast[];
  /** Bumped whenever a dataset changes, so dependents re-run. */
  dataVersion: number;
}

interface Actions {
  set(partial: Partial<State>): void;
  setConfig(partial: Partial<Config>): void;
  setScanConfig(partial: Partial<ScanConfig>): void;
  setRange(source: SourceKind, range: Range): void;
  setTab(tab: TabId): void;
  toggleTile(tile: number): void;
  toast(kind: Toast['kind'], text: string): void;
  dismissToast(id: number): void;
}

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable (private mode, quota) — preferences just won't persist */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

let toastId = 0;

export const DEFAULT_CONFIG: Config = {
  k: 5,
  risk: 'classic',
  depth: 25,
  threshold: 3,
  tiles: [],
  recentWindow: 100,
};

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      mode: 'standard',
      sound: true,
      welcomeAccepted: false,
      picks: { status: 'idle', progress: null, result: null, error: null, signature: null },
      detail: null,
      source: 'archive',
      archive: null,
      pf: null,
      ranges: { archive: { start: 0, end: -1 }, pf: { start: 0, end: -1 } },
      config: DEFAULT_CONFIG,
      scanConfig: { sort: 'value', poolMode: 'all', poolSize: 16, maxCombos: 100_000, minEvents: 0, seed: 1 },
      scan: { status: 'idle', progress: null, result: null, error: null, signature: null },
      analysis: null,
      analysisError: null,
      analyzing: false,
      verify: null,
      task: null,
      tab: 'overview',
      toasts: [],
      dataVersion: 0,

      set: (partial) => set(partial),
      setConfig: (partial) =>
        set((s) => {
          const next = { ...s.config, ...partial };
          next.k = Math.max(3, Math.min(10, Math.round(next.k)));
          if (next.tiles.length > next.k) next.tiles = next.tiles.slice(0, next.k);
          next.threshold = Math.max(1, Math.min(next.k, Math.round(next.threshold)));
          next.depth = Math.max(1, Math.min(1000, Math.round(next.depth)));
          next.recentWindow = Math.max(1, Math.round(next.recentWindow));
          return { config: next };
        }),
      setScanConfig: (partial) => set((s) => ({ scanConfig: { ...s.scanConfig, ...partial } })),
      setRange: (source, range) => set((s) => ({ ranges: { ...s.ranges, [source]: range } })),
      setTab: (tab) => set({ tab }),
      toggleTile: (tile) => {
        const { config, setConfig, toast } = get();
        if (config.tiles.includes(tile)) setConfig({ tiles: config.tiles.filter((t) => t !== tile) });
        else if (config.tiles.length < config.k) setConfig({ tiles: [...config.tiles, tile].sort((a, b) => a - b) });
        else toast('info', `Already ${config.k} tiles selected — raise K or deselect one first.`);
      },
      toast: (kind, text) => {
        const id = ++toastId;
        if (kind === 'error') sfx.error();
        else if (kind === 'success') sfx.success();
        set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
        setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'keno-scanner-prefs-v44',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        config: s.config,
        scanConfig: s.scanConfig,
        tab: s.tab,
        mode: s.mode,
        sound: s.sound,
        welcomeAccepted: s.welcomeAccepted,
      }),
      // Older saved prefs lack newer fields; merge over defaults instead of replacing.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          config: { ...current.config, ...p.config },
          scanConfig: { ...current.scanConfig, ...p.scanConfig },
        };
      },
    },
  ),
);

/** Number of draws in the active source. */
export function sourceCount(s: Pick<State, 'source' | 'archive' | 'pf'>): number {
  return s.source === 'archive' ? (s.archive?.count ?? 0) : (s.pf?.count ?? 0);
}
