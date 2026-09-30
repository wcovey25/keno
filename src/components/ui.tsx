import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Info, X } from 'lucide-react';
import { cx } from '../lib/format';

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClass,
  collapsible = false,
  defaultOpen = true,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const shown = !collapsible || open;
  return (
    <section className={cx('panel min-w-0', className)}>
      {(title || actions) && (
        <header className={cx('flex flex-wrap items-center gap-2 px-3 py-2', shown && 'border-b border-line')}>
          {collapsible ? (
            <button
              type="button"
              className="-my-1 flex min-w-0 items-center gap-2 py-1 text-left"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen(!open)}
            >
              <ChevronDown size={14} className={cx('shrink-0 text-ink-3 transition-transform', !open && '-rotate-90')} aria-hidden />
              {icon && <span className="text-neon-dim">{icon}</span>}
              {title && <h2 className="panel-title">{title}</h2>}
            </button>
          ) : (
            <>
              {icon && <span className="text-neon-dim">{icon}</span>}
              {title && <h2 className="panel-title">{title}</h2>}
            </>
          )}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {shown && (
        <div id={bodyId} className={cx('p-3', bodyClass)}>
          {children}
        </div>
      )}
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
      <div className="truncate text-[0.625rem] uppercase tracking-[0.14em] text-ink-3">{label}</div>
      <div className={cx('mt-1 truncate text-xl font-semibold tabular-nums', toneText[tone], tone === 'good' && 'glow')}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[0.6875rem] text-ink-3">{sub}</div>}
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
    <span title={title} className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-px text-[0.6875rem] whitespace-nowrap', border[tone])}>
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
        'flex gap-2 rounded border px-3 py-2 text-[0.75rem] leading-relaxed',
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

/**
 * Labelled form row. Use `group` for button groups: a <label> around several
 * buttons would forward clicks on the label text to the first button.
 */
export function Field({ label, children, hint, group = false }: { label: string; children: ReactNode; hint?: ReactNode; group?: boolean }) {
  const inner = (
    <>
      <span className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      {children}
      {hint && <span className="text-[0.6875rem] text-ink-3">{hint}</span>}
    </>
  );
  return group ? (
    <div className="flex min-w-0 flex-col gap-1" role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className="flex min-w-0 flex-col gap-1">{inner}</label>
  );
}

/** Accessible modal dialog: Escape / backdrop closes, focus moves in and is restored on close. */
export function Modal({ title, onClose, children, wide = false }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="fade-in fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'panel flex max-h-[92dvh] w-full flex-col outline-none sm:max-h-[88dvh]',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
          'rounded-b-none sm:rounded-md',
        )}
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 id={titleId} className="panel-title min-w-0 flex-1 truncate">
            {title}
          </h2>
          <button type="button" className="btn px-2 py-1" aria-label="Close" data-sfx="close" onClick={onClose}>
            <X size={14} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
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
            'inline-flex h-5 min-w-6 items-center justify-center rounded-sm border px-1 text-[0.6875rem] tabular-nums',
            highlight?.has(t) ? 'border-neon bg-neon/15 text-neon' : tone === 'hot' ? 'border-hot/50 text-hot' : tone === 'cold' ? 'border-cold/50 text-cold' : 'border-line-strong text-ink-2',
          )}
        >
          {t + 1}
        </span>
      ))}
    </span>
  );
}
