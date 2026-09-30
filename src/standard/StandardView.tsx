/**
 * Standard mode — the three-step, few-options view:
 *   1. load data   2. choose spots + risk + window   3. read the auto-updating Top Picks.
 * Everything else uses sensible defaults; Advanced mode exposes the full toolkit.
 */
import { useMemo, useState } from 'react';
import { BookOpen, Copy, Database, Flame, Gamepad2, RefreshCw, Snowflake, Sparkles } from 'lucide-react';
import { useStore, sourceCount } from '../state/store';
import { PICKS_DEPTH, clearArchive, copyTiles, openDetail, runPicks } from '../state/actions';
import { ArchiveSection, SeedSection, UploadZone } from '../components/DataPanel';
import { Field, Panel, ProgressBar, Seg, TileChips } from '../components/ui';
import { HeatBoard } from '../tabs/common';
import { RISKS, RISK_LABEL, atLeastProbability } from '../core/payouts';
import { profitLevels, type ComboResult } from '../core/scanner';
import { cx, fmtDate, fmtInt, fmtMult, fmtNum } from '../lib/format';

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neon-dim text-[0.6875rem] text-neon" aria-hidden>
      {n}
    </span>
  );
}

function LoadCard() {
  const archive = useStore((s) => s.archive);
  const pf = useStore((s) => s.pf);
  const hasData = useStore((s) => sourceCount(s) > 0);
  const [tab, setTab] = useState<'archive' | 'seeds'>('archive');
  const [manage, setManage] = useState(false);

  if (hasData && !manage) {
    return (
      <Panel title={<span className="flex items-center gap-2"><StepBadge n={1} /> Your data</span>} icon={<Database size={14} />}>
        <div className="space-y-2 text-[0.8125rem]">
          {archive && archive.count > 0 && (
            <p>
              <b className="text-neon">{fmtInt(archive.count)}</b> bets from {archive.files.length} file{archive.files.length === 1 ? '' : 's'}
              {archive.timeFrom !== null && (
                <span className="text-ink-3">
                  {' '}
                  · {fmtDate(archive.timeFrom, false)} → {fmtDate(archive.timeTo, false)}
                </span>
              )}
            </p>
          )}
          {pf && (
            <p>
              <b className="text-neon">{fmtInt(pf.count)}</b> seed rounds <span className="text-ink-3">· nonce {fmtInt(pf.nonceStart)}–{fmtInt(pf.nonceEnd)}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setManage(true)}>
              Add or manage data
            </button>
            {archive && archive.count > 0 && (
              <button type="button" className="btn btn-danger" onClick={() => void clearArchive()}>
                Clear
              </button>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={<span className="flex items-center gap-2"><StepBadge n={1} /> Load your rounds</span>}
      actions={
        <Seg
          label="Data type"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'archive', label: 'Bet archive' },
            { value: 'seeds', label: 'Seeds' },
          ]}
        />
      }
    >
      {tab === 'archive' ? hasData ? <ArchiveSection /> : <UploadZone /> : <SeedSection onUseArchive={() => setTab('archive')} />}
      {hasData && (
        <button type="button" className="btn mt-3 w-full" onClick={() => setManage(false)}>
          Done
        </button>
      )}
    </Panel>
  );
}

const WINDOWS = [
  { value: 0, label: 'All' },
  { value: 10000, label: 'Last 10k' },
  { value: 1000, label: 'Last 1k' },
  { value: 500, label: 'Last 500' },
  { value: 100, label: 'Last 100' },
];

function GameCard() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const source = useStore((s) => s.source);
  const n = useStore(sourceCount);
  const range = useStore((s) => s.ranges[s.source]);
  const setRange = useStore((s) => s.setRange);
  const windows = WINDOWS.filter((w) => w.value === 0 || w.value < n);
  const current = range.start === 0 && range.end === n - 1 ? 0 : range.end === n - 1 ? n - range.start : -1;
  const best = profitLevels(config.risk, config.k);

  return (
    <Panel title={<span className="flex items-center gap-2"><StepBadge n={2} /> Choose your game</span>} icon={<Gamepad2 size={14} />}>
      <div className="space-y-3">
        <Field group label="Tiles you pick (spots)">
          <Seg label="Number of spots" value={config.k} onChange={(k) => setConfig({ k })} options={Array.from({ length: 8 }, (_, i) => ({ value: i + 3, label: String(i + 3) }))} />
        </Field>
        <Field group label="Risk">
          <Seg label="Risk" value={config.risk} onChange={(risk) => setConfig({ risk })} options={RISKS.map((r) => ({ value: r, label: RISK_LABEL[r] }))} />
        </Field>
        {n > 100 && (
          <Field group label="Look at">
            <Seg
              label="Rounds to analyze"
              value={current}
              onChange={(v) => setRange(source, v === 0 ? { start: 0, end: n - 1 } : { start: n - v, end: n - 1 })}
              options={windows.map((w) => ({ value: w.value, label: w.label }))}
            />
          </Field>
        )}
        <p className="text-[0.75rem] leading-relaxed text-ink-3">
          {best.length > 0 && (
            <>
              With {config.k} spots on {RISK_LABEL[config.risk]}, you profit from <b className="text-ink-2">{best[0].m}+ matches</b> (about 1 round in{' '}
              {fmtNum(1 / atLeastProbability(config.k, best[0].m), 1)}); the top prize is <b className="text-ink-2">{fmtMult(best[best.length - 1].payout)}</b> for all {config.k}.
            </>
          )}
        </p>
      </div>
    </Panel>
  );
}

function DueMeter({ value }: { value: number }) {
  // Log scale: 1× (normal) ≈ a quarter, 3× ≈ half, ~15× full — keeps big values distinguishable.
  const pct = Math.min(1, Math.log2(1 + Math.max(0, value)) / 4) * 100;
  return (
    <div className="flex items-center gap-2" title={`Current gap is ${fmtNum(value, 2)}× the usual gap`}>
      <div className="h-1.5 w-16 overflow-hidden rounded bg-line sm:w-20">
        <div className={cx('h-full rounded', value >= 2 ? 'bg-warn' : 'bg-neon-dim')} style={{ width: `${pct}%` }} />
      </div>
      <span className={cx('w-12 text-right tabular-nums', value >= 2 ? 'text-warn' : 'text-ink-2')}>{fmtNum(value, 1)}×</span>
    </div>
  );
}

function PickRow({ rank, pick, k }: { rank: number; pick: ComboResult; k: number }) {
  const b = pick.best;
  if (!b) return null;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => openDetail(pick.tiles)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openDetail(pick.tiles))}
        className="group flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded border border-line px-3 py-2.5 transition-colors hover:border-neon-dim hover:bg-neon/[0.03] focus-visible:outline-1"
        aria-label={`Pick ${rank}: tiles ${pick.tiles.map((t) => t + 1).join(', ')}. Open details`}
      >
        <span className="w-6 text-[0.75rem] text-ink-3 tabular-nums">#{rank}</span>
        <TileChips tiles={pick.tiles} />
        <div className="ml-auto flex items-center gap-2">
          <DueMeter value={b.overdue} />
          <button
            type="button"
            className="btn px-1.5 py-1"
            aria-label="Copy tiles"
            title="Copy tiles"
            onClick={(e) => {
              e.stopPropagation();
              copyTiles(pick.tiles);
            }}
          >
            <Copy size={13} />
          </button>
        </div>
        <p className="basis-full pl-9 text-[0.75rem] text-ink-3">
          <span className="text-ink-2">
            {b.m}+ of {k} pays {fmtMult(b.payout)}
          </span>{' '}
          · usually every {fmtNum(b.expectedInterval, b.expectedInterval < 10 ? 1 : 0)} rounds · last hit{' '}
          {b.events === 0 ? <span className="text-warn">never in window</span> : <>{fmtInt(b.gap)} rounds ago</>} · luck {fmtNum(b.luck, 2)}
        </p>
      </div>
    </li>
  );
}

function TopPicks() {
  const picks = useStore((s) => s.picks);
  const config = useStore((s) => s.config);
  const hasData = useStore((s) => sourceCount(s) > 0);
  const r = picks.result;
  const running = picks.status === 'running';

  return (
    <Panel
      title={<span className="flex items-center gap-2"><StepBadge n={3} /> Top picks</span>}
      icon={<Sparkles size={14} />}
      actions={
        hasData && (
          <button type="button" className="btn px-2 py-1 text-[0.75rem]" disabled={running} onClick={() => void runPicks()}>
            <RefreshCw size={13} className={cx(running && 'animate-spin')} /> Rescan
          </button>
        )
      }
    >
      {!hasData ? (
        <p className="py-8 text-center text-ink-3">Load your rounds to see the most “due” combinations.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.75rem] text-ink-3">
            {config.k}-tile combinations whose winning hits are furthest past their usual gap, weighted by payout. Tap one for its board and history.
          </p>
          {running && (
            <div className="space-y-1" aria-live="polite">
              <ProgressBar value={picks.progress ? picks.progress.done / Math.max(1, picks.progress.total) : null} label="Scanning combinations" />
              <p className="text-[0.6875rem] text-ink-3 tabular-nums">
                Scanning{picks.progress ? ` ${fmtInt(picks.progress.done)} / ${fmtInt(picks.progress.total)}` : ''} combinations…
              </p>
            </div>
          )}
          {picks.status === 'error' && <p className="text-bad">{picks.error}</p>}
          {r && (
            <ol className={cx('space-y-2 transition-opacity', running && 'opacity-50')}>
              {r.results.slice(0, PICKS_DEPTH).map((p, i) => (
                <PickRow key={p.tiles.join('-')} rank={i + 1} pick={p} k={config.k} />
              ))}
            </ol>
          )}
          {r && (
            <p className="text-[0.6875rem] text-ink-3">
              {fmtInt(r.scanned)} of {fmtInt(r.space)} combinations {r.mode === 'sampled' ? 'sampled' : 'checked'} over {fmtInt(r.n)} rounds in {fmtNum(r.elapsedMs / 1000, 1)} s.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function HotCold() {
  const tiles = useStore((s) => s.analysis?.tiles.tiles);
  const sorted = useMemo(() => (tiles ? [...tiles].sort((a, b) => b.z - a.z) : []), [tiles]);
  if (!tiles) return null;
  return (
    <Panel title="Hot & cold numbers" icon={<Flame size={14} />}>
      <div className="space-y-3">
        <div className="mx-auto max-w-[26rem]">
          <HeatBoard size="sm" interactive={false} />
        </div>
        <div className="grid gap-2 text-[0.75rem] sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <Flame size={13} className="text-hot" aria-label="Hottest" /> <TileChips tiles={sorted.slice(0, 5).map((t) => t.tile)} tone="hot" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Snowflake size={13} className="text-cold" aria-label="Coldest" /> <TileChips tiles={sorted.slice(-5).reverse().map((t) => t.tile)} tone="cold" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function HowItWorks() {
  return (
    <Panel title="How it works" icon={<BookOpen size={14} />} collapsible defaultOpen={false}>
      <div className="space-y-2 text-[0.75rem] leading-relaxed text-ink-2">
        <p>
          Stake Keno draws <b className="text-ink">10 of 40</b> squares each round. You pick 3–10 squares; your payout depends on how many of them are drawn and your risk
          level.
        </p>
        <p>
          For every combination the scanner measures how long it has been since it last hit each winning level, compared with how often that level hits on average.
          Picks rank highest when a big, reasonably frequent win is well past its usual gap.
        </p>
        <p>
          <b className="text-ink">Luck</b> = actual hits ÷ expected hits (1.00 is exactly average). <b className="text-ink">Due</b> = rounds since last hit ÷ usual gap.
        </p>
        <p className="text-ink-3">
          It’s a fun way to choose numbers — not a prediction. Every round is independent and has the same odds no matter what happened before.
        </p>
      </div>
    </Panel>
  );
}

export function StandardView() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] 2xl:grid-cols-[24rem_minmax(0,1fr)_minmax(0,30rem)]">
      <div className="space-y-4">
        <LoadCard />
        <GameCard />
        <div className="hidden lg:block">
          <HowItWorks />
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <TopPicks />
        <div className="2xl:hidden">
          <HotCold />
        </div>
        <div className="lg:hidden">
          <HowItWorks />
        </div>
      </div>
      <div className="hidden min-w-0 2xl:block">
        <HotCold />
      </div>
    </div>
  );
}
