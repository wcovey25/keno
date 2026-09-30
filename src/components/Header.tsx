import { Activity, Cpu, Database, HelpCircle, KeyRound, Volume2, VolumeX } from 'lucide-react';
import { useStore, type UiMode } from '../state/store';
import { setMode, setSource } from '../state/actions';
import { ProgressBar } from './ui';
import { cx, fmtInt } from '../lib/format';

function ModeToggle() {
  const mode = useStore((s) => s.mode);
  const options: { value: UiMode; label: string; title: string }[] = [
    { value: 'standard', label: 'Standard', title: 'Simple view with automatic Top Picks' },
    { value: 'advanced', label: 'Advanced', title: 'Every tool and setting' },
  ];
  return (
    <div className="seg" role="group" aria-label="Interface mode">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={mode === o.value} title={o.title} data-sfx="mode" onClick={() => setMode(o.value)} className="px-3">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const mode = useStore((s) => s.mode);
  const source = useStore((s) => s.source);
  const archive = useStore((s) => s.archive);
  const pf = useStore((s) => s.pf);
  const task = useStore((s) => s.task);
  const analyzing = useStore((s) => s.analyzing);
  const elapsed = useStore((s) => s.analysis?.elapsedMs);
  const scanRunning = useStore((s) => s.scan.status === 'running' || s.picks.status === 'running');
  const sound = useStore((s) => s.sound);
  const set = useStore((s) => s.set);

  const sources = [
    { id: 'archive' as const, label: 'Archive', icon: <Database size={13} aria-hidden />, count: archive?.count ?? 0 },
    { id: 'pf' as const, label: 'Seeds', icon: <KeyRound size={13} aria-hidden />, count: pf?.count ?? 0 },
  ];
  // Standard mode only needs the source switch when both kinds of data are loaded.
  const showSources = mode === 'advanced' || (sources[0].count > 0 && sources[1].count > 0);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-[120rem] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tracking-[0.18em] text-neon glow sm:text-lg">KENO//SCANNER</span>
          <span className="hidden text-[0.6875rem] text-ink-3 sm:inline">v44</span>
        </div>
        <div className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">
          <ModeToggle />
          {showSources && (
            <nav aria-label="Analysis source" className="seg">
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={source === s.id}
                  disabled={s.count === 0}
                  className="flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setSource(s.id)}
                  title={s.count === 0 ? `No ${s.label.toLowerCase()} data loaded` : `Analyze ${s.label.toLowerCase()} data`}
                >
                  {s.icon}
                  {s.label}
                  <span className="hidden tabular-nums text-ink-3 md:inline">{s.count ? fmtInt(s.count) : ''}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2 text-[0.6875rem] text-ink-3 sm:gap-3">
          {task ? (
            <div className="flex w-32 flex-col gap-1 sm:w-56" aria-live="polite">
              <span className="truncate text-ink-2">{task.label}…</span>
              <ProgressBar value={task.progress ? task.progress.done / Math.max(1, task.progress.total) : null} label={task.label} />
            </div>
          ) : (
            <span className="hidden items-center gap-1.5 md:flex" aria-live="polite">
              <Activity size={13} className={cx(analyzing ? 'pulse-dot text-neon' : 'text-neon-dim')} aria-hidden />
              {analyzing ? 'computing…' : elapsed !== undefined ? `analysis ${elapsed.toFixed(0)} ms` : 'idle'}
            </span>
          )}
          {scanRunning && (
            <span className="flex items-center gap-1 text-cyan" title="Scanning combinations">
              <Cpu size={13} className="pulse-dot" aria-hidden /> <span className="hidden sm:inline">scanning</span>
            </span>
          )}
          <button
            type="button"
            className="btn px-2 py-1"
            aria-pressed={sound}
            aria-label={sound ? 'Mute sounds' : 'Unmute sounds'}
            title={sound ? 'Sounds on' : 'Sounds off'}
            data-sfx={sound ? 'off' : 'click'}
            onClick={() => set({ sound: !sound })}
          >
            {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button type="button" className="btn px-2 py-1" aria-label="About and disclaimer" title="About" onClick={() => set({ welcomeAccepted: false })}>
            <HelpCircle size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
