import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cx } from '../lib/format';

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cx('panel min-w-0', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          {icon && <span className="text-neon-dim">{icon}</span>}
          {title && <h2 className="panel-title">{title}</h2>}
          <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={cx('p-3', bodyClass)}>{children}</div>
    </section>
  );
}

export type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'hot' | 'cold';

const toneText: Record<Tone, string> = {
  neutral: 'text-ink',
  good: 'text-neon',
  bad: 'text-bad',
  warn: 'text-warn',
  hot: 'text-hot',
  cold: 'text-cold',
};

export function Stat({ label, value, sub, tone = 'neutral', title }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; title?: string }) {
  return (
    <div className="panel min-w-0 px-3 py-2.5" title={title}>
      <div className="truncate text-[10px] uppercase tracking-[0.14em] text-ink-3">{label}</div>
      <div className={cx('mt-1 truncate text-xl font-semibold tabular-nums', toneText[tone], tone === 'good' && 'glow')}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  const border: Record<Tone, string> = {
    neutral: 'border-line-strong text-ink-2',
    good: 'border-neon-dim text-neon',
    bad: 'border-bad/60 text-bad',
    warn: 'border-warn/60 text-warn',
    hot: 'border-hot/60 text-hot',
    cold: 'border-cold/60 text-cold',
  };
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-px text-[11px] whitespace-nowrap', border[tone])}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  const pct = value === null ? null : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={label}>
      <div className="h-1.5 overflow-hidden rounded bg-line">
        <div
          className={cx('h-full rounded bg-neon transition-[width] duration-150', pct === null && 'pulse-dot w-1/3')}
          style={pct === null ? undefined : { width: `${pct}%`, boxShadow: '0 0 8px #39ff88' }}
        />
      </div>
    </div>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'bad' }) {
  return (
    <div
      className={cx(
        'flex gap-2 rounded border px-3 py-2 text-[12px] leading-relaxed',
        tone === 'neutral' && 'border-line text-ink-2',
        tone === 'warn' && 'border-warn/40 bg-warn/5 text-warn',
        tone === 'bad' && 'border-bad/40 bg-bad/5 text-bad',
      )}
    >
      <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="text-neon-dim">{icon}</div>
      <div className="text-base text-ink glow">{title}</div>
      {children && <div className="max-w-md text-ink-3">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

/** Squares as compact board-label chips. */
export function TileChips({ tiles, highlight, tone = 'neutral' }: { tiles: number[]; highlight?: Set<number>; tone?: Tone }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tiles.map((t) => (
        <span
          key={t}
          className={cx(
            'inline-flex h-5 min-w-6 items-center justify-center rounded-sm border px-1 text-[11px] tabular-nums',
            highlight?.has(t) ? 'border-neon bg-neon/15 text-neon' : tone === 'hot' ? 'border-hot/50 text-hot' : tone === 'cold' ? 'border-cold/50 text-cold' : 'border-line-strong text-ink-2',
          )}
        >
          {t + 1}
        </span>
      ))}
    </span>
  );
}
