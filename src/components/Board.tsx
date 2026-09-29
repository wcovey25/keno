import { memo } from 'react';
import { cx } from '../lib/format';

/**
 * Diverging fill: −1 (cold) … 0 (neutral gray) … +1 (hot). The midpoint is a
 * hue-less gray; intensity scales with |v| so labels always stay readable.
 */
export function divergingFill(v: number): string {
  if (!Number.isFinite(v) || v === 0) return 'var(--color-panel-2)';
  const pct = Math.round(Math.min(1, Math.abs(v)) * 70);
  const pole = v > 0 ? 'var(--color-hot)' : 'var(--color-cold)';
  return `color-mix(in oklab, ${pole} ${pct}%, #18211e)`;
}

export interface BoardProps {
  /** Per-square diverging value in [−1, 1] (optional heat layer). */
  heat?: ArrayLike<number>;
  /** Per-square secondary text (e.g. count). */
  sub?: (string | number)[];
  /** Per-square tooltip. */
  titles?: string[];
  selected?: ReadonlySet<number>;
  drawn?: ReadonlySet<number>;
  onToggle?: (tile: number) => void;
  size?: 'xs' | 'sm' | 'md';
  label: string;
}

/** Stake-style 8 × 5 Keno board (squares 1..40). */
export const Board = memo(function Board({ heat, sub, titles, selected, drawn, onToggle, size = 'md', label }: BoardProps) {
  const interactive = Boolean(onToggle);
  return (
    <div
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      className={cx('grid grid-cols-8', size === 'xs' ? 'gap-px' : size === 'sm' ? 'gap-1' : 'gap-1.5')}
    >
      {Array.from({ length: 40 }, (_, t) => {
        const isSel = selected?.has(t) ?? false;
        const isDrawn = drawn?.has(t) ?? false;
        const hit = isSel && isDrawn;
        const style = heat && !isDrawn ? { background: divergingFill(heat[t]) } : undefined;
        const common = cx(
          'relative flex flex-col items-center justify-center rounded-[3px] border tabular-nums select-none',
          size === 'xs' ? 'h-4 text-[8px] leading-none' : size === 'sm' ? 'aspect-square text-[11px]' : 'aspect-square text-[13px] sm:text-sm',
          isDrawn ? (hit ? 'border-neon bg-neon text-bg font-bold' : 'border-violet/70 bg-violet/40 text-ink') : 'border-line',
          !heat && !isDrawn && 'bg-panel-2',
          isSel && !hit && 'border-neon text-neon shadow-[0_0_10px_-2px_var(--color-neon),inset_0_0_0_1px_var(--color-neon)]',
          !isSel && !isDrawn && 'text-ink',
        );
        const content = (
          <>
            <span className={cx(size !== 'xs' && 'font-semibold')}>{size === 'xs' ? '' : t + 1}</span>
            {sub && size !== 'xs' && <span className="text-[9px] leading-none opacity-75 sm:text-[10px]">{sub[t]}</span>}
          </>
        );
        return interactive ? (
          <button
            key={t}
            type="button"
            aria-pressed={isSel}
            aria-label={`Square ${t + 1}${titles ? `: ${titles[t]}` : ''}`}
            title={titles?.[t]}
            onClick={() => onToggle!(t)}
            className={cx(common, 'cursor-pointer transition-[transform,box-shadow] duration-100 hover:scale-[1.06] hover:border-neon-dim active:scale-95')}
            style={style}
          >
            {content}
          </button>
        ) : (
          <div key={t} title={titles?.[t]} className={common} style={style}>
            {content}
          </div>
        );
      })}
    </div>
  );
});

export function HeatLegend({ lowLabel, highLabel }: { lowLabel: string; highLabel: string }) {
  const stops = [-1, -0.5, 0, 0.5, 1];
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-3" aria-hidden>
      <span>{lowLabel}</span>
      <div className="flex overflow-hidden rounded-sm border border-line">
        {stops.map((s) => (
          <span key={s} className="h-2.5 w-6" style={{ background: divergingFill(s) }} />
        ))}
      </div>
      <span>{highLabel}</span>
    </div>
  );
}
