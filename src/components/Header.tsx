import { Activity, Cpu, Database, KeyRound } from 'lucide-react';
import { useStore } from '../state/store';
import { setSource } from '../state/actions';
import { ProgressBar } from './ui';
import { cx, fmtInt } from '../lib/format';

export function Header() {
  const source = useStore((s) => s.source);
  const archive = useStore((s) => s.archive);
  const pf = useStore((s) => s.pf);
  const task = useStore((s) => s.task);
  const analyzing = useStore((s) => s.analyzing);
  const elapsed = useStore((s) => s.analysis?.elapsedMs);
  const scanRunning = useStore((s) => s.scan.status === 'running');

  const sources = [
    { id: 'archive' as const, label: 'Archive', icon: <Database size={13} aria-hidden />, count: archive?.count ?? 0 },
    { id: 'pf' as const, label: 'Provably Fair', icon: <KeyRound size={13} aria-hidden />, count: pf?.count ?? 0 },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-[0.2em] text-neon glow">KENO//SCANNER</span>
          <span className="text-[11px] text-ink-3">v44</span>
        </div>
        <nav aria-label="Analysis source" className="seg">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={source === s.id}
              disabled={s.count === 0}
              className={cx('flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40')}
              onClick={() => setSource(s.id)}
              title={s.count === 0 ? `No ${s.label} data loaded` : `Analyze ${s.label} data`}
            >
              {s.icon}
              {s.label}
              <span className="tabular-nums text-ink-3">{s.count ? fmtInt(s.count) : ''}</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3 text-[11px] text-ink-3">
          {task ? (
            <div className="flex w-56 flex-col gap-1" aria-live="polite">
              <span className="truncate text-ink-2">{task.label}…</span>
              <ProgressBar value={task.progress ? task.progress.done / Math.max(1, task.progress.total) : null} label={task.label} />
            </div>
          ) : (
            <span className="flex items-center gap-1.5" aria-live="polite">
              <Activity size={13} className={cx(analyzing ? 'pulse-dot text-neon' : 'text-neon-dim')} aria-hidden />
              {analyzing ? 'computing…' : elapsed !== undefined ? `analysis ${elapsed.toFixed(0)} ms` : 'idle'}
            </span>
          )}
          {scanRunning && (
            <span className="flex items-center gap-1 text-cyan">
              <Cpu size={13} className="pulse-dot" aria-hidden /> scanning
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
