import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CalendarRange, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../state/store';
import { resolveTimeRange } from '../state/actions';
import type { Range } from '../core/dataset';
import { cx, fmtDate, fmtInt, toLocalInput } from '../lib/format';

/** Dual-handle range slider over integer indices [0, max]. */
export function RangeSlider({ max, value, onChange, label }: { max: number; value: Range; onChange: (r: Range) => void; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<null | { handle: 'start' | 'end' | 'window'; origin: number; initial: Range }>(null);
  const span = Math.max(1, max);
  const pct = (v: number) => (v / span) * 100;

  const valueAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * span);
  };

  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.handle) return;
    const v = valueAt(e.clientX);
    const handle = Math.abs(v - value.start) <= Math.abs(v - value.end) ? 'start' : 'end';
    const next = handle === 'start' ? { start: Math.min(v, value.end), end: value.end } : { start: value.start, end: Math.max(v, value.start) };
    onChange(next);
    track.current!.setPointerCapture(e.pointerId);
    setDrag({ handle, origin: v, initial: next });
  };

  const onHandleDown = (handle: 'start' | 'end' | 'window') => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    track.current!.setPointerCapture(e.pointerId);
    setDrag({ handle, origin: valueAt(e.clientX), initial: value });
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const v = valueAt(e.clientX);
    const { initial } = drag;
    if (drag.handle === 'start') onChange({ start: Math.min(v, initial.end), end: initial.end });
    else if (drag.handle === 'end') onChange({ start: initial.start, end: Math.max(v, initial.start) });
    else {
      const width = initial.end - initial.start;
      const start = Math.max(0, Math.min(span - width, initial.start + (v - drag.origin)));
      onChange({ start, end: start + width });
    }
  };

  const onKey = (handle: 'start' | 'end') => (e: KeyboardEvent) => {
    const step = e.shiftKey ? Math.max(10, Math.round(span / 20)) : 1;
    let delta = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = step;
    else if (e.key === 'PageDown') delta = -Math.max(10, Math.round(span / 10));
    else if (e.key === 'PageUp') delta = Math.max(10, Math.round(span / 10));
    else if (e.key === 'Home') delta = -span;
    else if (e.key === 'End') delta = span;
    else return;
    e.preventDefault();
    if (handle === 'start') onChange({ start: Math.max(0, Math.min(value.end, value.start + delta)), end: value.end });
    else onChange({ start: value.start, end: Math.min(span, Math.max(value.start, value.end + delta)) });
  };

  const handleCls =
    'absolute top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-neon bg-bg shadow-[0_0_10px_-2px_var(--color-neon)] focus-visible:outline-2';

  return (
    <div
      ref={track}
      className="relative h-8 cursor-pointer touch-none select-none"
      onPointerDown={onTrackDown}
      onPointerMove={onMove}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      aria-label={label}
      role="group"
    >
      <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded bg-line" />
      <div
        className={cx('absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-neon-dim', drag?.handle === 'window' ? 'cursor-grabbing' : 'cursor-grab')}
        style={{ left: `${pct(value.start)}%`, width: `${Math.max(0.3, pct(value.end) - pct(value.start))}%`, boxShadow: '0 0 10px #39ff8855' }}
        onPointerDown={onHandleDown('window')}
        data-handle="window"
        title="Drag to slide the window"
      />
      {(['start', 'end'] as const).map((h) => (
        <div
          key={h}
          data-handle={h}
          role="slider"
          tabIndex={0}
          aria-label={h === 'start' ? 'Window start' : 'Window end'}
          aria-valuemin={h === 'start' ? 0 : value.start}
          aria-valuemax={h === 'start' ? value.end : span}
          aria-valuenow={value[h]}
          aria-valuetext={`Bet ${value[h] + 1}`}
          className={handleCls}
          style={{ left: `${pct(value[h])}%` }}
          onPointerDown={onHandleDown(h)}
          onKeyDown={onKey(h)}
        />
      ))}
    </div>
  );
}

function NumberInput({ value, min, max, onCommit, label }: { value: number; min: number; max: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Math.round(Number(text));
    if (Number.isFinite(v)) onCommit(Math.max(min, Math.min(max, v)));
    else setText(String(value));
  };
  return (
    <input
      className="field w-24 text-right tabular-nums"
      inputMode="numeric"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

export function RangeBar() {
  const source = useStore((s) => s.source);
  const n = useStore((s) => (s.source === 'archive' ? (s.archive?.count ?? 0) : (s.pf?.count ?? 0)));
  const range = useStore((s) => s.ranges[s.source]);
  const setRange = useStore((s) => s.setRange);
  const analysis = useStore((s) => s.analysis);
  const hasTime = useStore((s) => s.source === 'archive' && s.archive?.order === 'time');
  const archive = useStore((s) => s.archive);

  // Local mirror so dragging is instant; the store (and analysis) follow via rAF.
  const [local, setLocal] = useState(range);
  useEffect(() => setLocal(range), [range]);
  const raf = useRef(0);
  const update = useCallback(
    (r: Range) => {
      setLocal(r);
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setRange(source, r));
    },
    [setRange, source],
  );

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    setFrom(toLocalInput(archive?.timeFrom ?? null));
    setTo(toLocalInput(archive?.timeTo ?? null));
  }, [archive?.timeFrom, archive?.timeTo]);

  if (n === 0) return null;
  const max = n - 1;
  const count = local.end - local.start + 1;
  const presets: { label: string; r: Range }[] = [
    { label: 'All', r: { start: 0, end: max } },
    ...[100, 500, 1000, 10000].filter((k) => k < n).map((k) => ({ label: `Last ${k >= 1000 ? `${k / 1000}k` : k}`, r: { start: n - k, end: max } })),
  ];

  return (
    <section className="panel px-3 py-2.5" aria-label="Analysis window">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-ink-2">
          <SlidersHorizontal size={14} className="text-neon-dim" aria-hidden />
          <span className="panel-title">Window</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-ink-3">Bet #</span>
          <NumberInput label="Window start (bet number)" value={local.start + 1} min={1} max={local.end + 1} onCommit={(v) => update({ start: v - 1, end: local.end })} />
          <span className="text-ink-3">→</span>
          <NumberInput label="Window end (bet number)" value={local.end + 1} min={local.start + 1} max={n} onCommit={(v) => update({ start: local.start, end: v - 1 })} />
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={cx('btn px-2 py-0.5 text-[11px]', p.r.start === local.start && p.r.end === local.end && 'border-neon-dim text-neon')}
              onClick={() => update(p.r)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-right text-[12px] text-ink-2 tabular-nums">
          <b className="text-neon glow">{fmtInt(count)}</b> / {fmtInt(n)} draws
          {analysis && analysis.timeFrom !== null && (
            <span className="ml-2 text-ink-3">
              {fmtDate(analysis.timeFrom)} → {fmtDate(analysis.timeTo)}
            </span>
          )}
          {analysis && analysis.timeFrom === null && analysis.nonceFrom !== null && (
            <span className="ml-2 text-ink-3">
              nonce {fmtInt(analysis.nonceFrom)} → {fmtInt(analysis.nonceTo)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1.5">
        <RangeSlider max={max} value={local} onChange={update} label="Bet index window" />
      </div>
      {hasTime && (
        <form
          className="mt-1 flex flex-wrap items-center gap-2 text-[12px]"
          onSubmit={(e) => {
            e.preventDefault();
            const f = from ? new Date(from).getTime() : null;
            // datetime-local has minute precision: make "to" inclusive of that whole minute.
            const t = to ? new Date(to).getTime() + 59_999 : null;
            void resolveTimeRange(f, t);
          }}
        >
          <CalendarRange size={14} className="text-neon-dim" aria-hidden />
          <span className="text-ink-3">Time window</span>
          <input type="datetime-local" className="field py-0.5" aria-label="From time" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ink-3">→</span>
          <input type="datetime-local" className="field py-0.5" aria-label="To time" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="submit" className="btn px-2 py-0.5 text-[11px]">
            Apply
          </button>
        </form>
      )}
    </section>
  );
}
