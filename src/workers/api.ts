/** Shared contract between the UI thread and the workers (types only). */
import type { Range, SourceKind } from '../core/dataset';
import type { FileReport, NumberBase, NumberBaseSetting } from '../core/parser';
import type { Risk } from '../core/payouts';
import type { SeedCheck } from '../core/provablyFair';
import type { ArchiveRtp, SetAnalysis, TileAnalysis } from '../core/stats';
import type { DrawRow } from '../core/exporters';
import type { ScanParams, ScanResult } from '../core/scanner';

export interface ArchiveSummary {
  files: FileReport[];
  count: number;
  duplicates: number;
  outOfRange: number;
  base: NumberBase;
  baseSetting: NumberBaseSetting;
  baseConclusive: boolean;
  baseConflicting: boolean;
  order: 'time' | 'nonce' | 'file';
  timeFrom: number | null;
  timeTo: number | null;
  nonceMin: number | null;
  nonceMax: number | null;
  withNonce: number;
  picks: number[];
  risks: Record<string, number>;
}

export interface PfParams {
  serverSeed: string;
  hashedServerSeed: string;
  clientSeed: string;
  nonceStart: number;
  count: number;
}

export interface PfSummary {
  count: number;
  clientSeed: string;
  nonceStart: number;
  nonceEnd: number;
  serverSeedHash: string;
  hashCheck: SeedCheck;
  elapsedMs: number;
}

export interface AnalyzeArgs {
  source: SourceKind;
  range: Range;
  tiles: number[];
  threshold: number;
  risk: Risk;
  recentWindow: number;
  depth: number;
}

export interface AnalysisResult {
  source: SourceKind;
  range: Range;
  timeFrom: number | null;
  timeTo: number | null;
  nonceFrom: number | null;
  nonceTo: number | null;
  tiles: TileAnalysis;
  set: SetAnalysis | null;
  archiveRtp: ArchiveRtp | null;
  elapsedMs: number;
}

export interface VerifyMismatch {
  index: number;
  nonce: number;
  betId: string | null;
  archive: number[];
  generated: number[];
}

export interface VerifyResult {
  considered: number;
  checked: number;
  matched: number;
  orderMatched: number;
  mismatched: number;
  noNonce: number;
  outsidePf: number;
  firstMatchIndex: number | null;
  lastMatchIndex: number | null;
  mismatches: VerifyMismatch[];
}

export type ExportKind = 'draws' | 'tiles' | 'analysis' | 'archive';
export type ExportFormat = 'csv' | 'json';

export interface ExportFile {
  filename: string;
  mime: string;
  content: string;
}

export interface DataApi {
  ingest(args: { files: File[] }): ArchiveSummary;
  removeFile(args: { name: string }): ArchiveSummary;
  clearArchive(args: Record<string, never>): ArchiveSummary;
  setBase(args: { base: NumberBaseSetting }): ArchiveSummary;
  generatePf(args: PfParams): PfSummary;
  clearPf(args: Record<string, never>): null;
  analyze(args: AnalyzeArgs): AnalysisResult;
  draws(args: { source: SourceKind; range: Range; offset: number; limit: number }): { total: number; rows: DrawRow[] };
  scanInput(args: { source: SourceKind; range: Range }): Uint8Array;
  verify(args: { range: Range; depth: number }): VerifyResult;
  timeToRange(args: { source: SourceKind; from: number | null; to: number | null }): Range | null;
  export(args: { kind: ExportKind; format: ExportFormat; source: SourceKind; range: Range; analyze: AnalyzeArgs }): ExportFile;
}

export interface ScanApi {
  scan(args: { drawn: Uint8Array; params: ScanParams }): ScanResult;
}
