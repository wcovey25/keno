/**
 * Lightweight SVG charts. Series arrive pre-downsampled from the worker
 * (≤ ~600 points), so rendering is cheap and needs no chart library.
 */
import { useMemo, useState, type PointerEvent } from 'react';
import { useWidth } from '../lib/useWidth';
import { fmtInt, fmtNum } from '../lib/format';

const OBSERVED = '#1aa865';
const EXPECTED = '#8474f0';
const GRID = '#132a20';
const AXIS_TEXT = '#62806f';

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

const compact = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${(v / 1e3).toFixed(0)}k` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${+v.toFixed(2)}`;

/** Single-series line chart with zero baseline and crosshair tooltip (e.g. cumulative P&L). */
export function LineChart({
  x,
  y,
  xOffset = 0,
  height = 220,
  label,
  valueLabel,
  xLabel = 'Bet',
}: {
  x: number[];
  y: number[];
  xOffset?: number;
  height?: number;
  label: string;
  valueLabel: string;
  xLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 48, r: 12, t: 10, b: 24 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;

  const geo = useMemo(() => {
    if (x.length === 0) return null;
    let lo = 0, hi = 0;
    for (const v of y) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo === hi) hi = lo + 1;
    const padY = (hi - lo) * 0.06;
    lo -= padY;
    hi += padY;
    const xMax = Math.max(1, x[x.length - 1]);
    const sx = (v: number) => pad.l + (v / xMax) * w;
    const sy = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * h;
    let d = '';
    for (let i = 0; i < x.length; i++) d += `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(y[i]).toFixed(1)}`;
    return { lo, hi, xMax, sx, sy, d, yTicks: niceTicks(lo, hi, 4), xTicks: niceTicks(0, xMax, Math.max(2, Math.floor(w / 110))) };
  }, [x, y, w, h, pad.l, pad.t]);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const target = ((px - pad.l) / w) * geo.xMax;
    let lo = 0, hi = x.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(x[lo - 1] - target) < Math.abs(x[lo] - target)) lo--;
    setHover(lo);
  };

  const last = y.length ? y[y.length - 1] : 0;
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {geo && width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="touch-none">
          {geo.yTicks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={geo.sy(t)} y2={geo.sy(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={geo.sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                {compact(t)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <text key={t} x={geo.sx(t)} y={height - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
              {compact(t + xOffset)}
            </text>
          ))}
          {geo.lo < 0 && geo.hi > 0 && (
            <line x1={pad.l} x2={pad.l + w} y1={geo.sy(0)} y2={geo.sy(0)} stroke="#3d5a4d" strokeDasharray="3 3" strokeWidth={1} />
          )}
          <path d={geo.d} fill="none" stroke={last >= 0 ? '#39ff88' : '#ff4f9a'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={geo.sx(x[hover])} x2={geo.sx(x[hover])} y1={pad.t} y2={pad.t + h} stroke="#3d5a4d" strokeWidth={1} />
              <circle cx={geo.sx(x[hover])} cy={geo.sy(y[hover])} r={4} fill={y[hover] >= 0 ? '#39ff88' : '#ff4f9a'} stroke="#0a100e" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {geo && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded border border-line-strong bg-panel/95 px-2 py-1 text-[11px] shadow-lg"
          style={{ left: Math.min(Math.max(0, geo.sx(x[hover]) + 8), Math.max(0, width - 150)) }}
        >
          <div className="text-ink-3">
            {xLabel} #{fmtInt(x[hover] + xOffset)}
          </div>
          <div className="text-ink">
            {valueLabel}: <b>{fmtNum(y[hover], 2)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

/** Observed counts (bars) vs expected counts (tick marks) per category. */
export function DistChart({
  categories,
  observed,
  expected,
  height = 180,
  label,
  categoryLabel = 'Matches',
}: {
  categories: string[];
  observed: number[];
  expected: number[];
  height?: number;
  label: string;
  categoryLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 8, t: 8, b: 22 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const max = Math.max(1, ...observed, ...expected);
  const band = w / Math.max(1, categories.length);
  const barW = Math.max(3, Math.min(40, band - 6));
  const sy = (v: number) => pad.t + h - (v / max) * h;
  const ticks = niceTicks(0, max, 3);

  return (
    <div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + w} y1={sy(t)} y2={sy(t)} stroke={GRID} />
                <text x={pad.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                  {compact(t)}
                </text>
              </g>
            ))}
            {categories.map((c, i) => {
              const cx = pad.l + band * i + band / 2;
              const top = sy(observed[i]);
              const bh = pad.t + h - top;
              return (
                <g key={c} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <rect x={cx - band / 2} y={pad.t} width={band} height={h} fill={hover === i ? '#0f2019' : 'transparent'} />
                  {bh > 0 && (
                    <path
                      d={`M${cx - barW / 2},${pad.t + h} V${top + Math.min(4, bh)} q0,-${Math.min(4, bh)} ${Math.min(4, barW / 2)},-${Math.min(4, bh)} H${cx + barW / 2 - Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, bh)} V${pad.t + h} Z`}
                      fill={OBSERVED}
                    />
                  )}
                  <line x1={cx - barW / 2 - 3} x2={cx + barW / 2 + 3} y1={sy(expected[i])} y2={sy(expected[i])} stroke={EXPECTED} strokeWidth={2} strokeLinecap="round" />
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
                    {c}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded border border-line-strong bg-panel/95 px-2 py-1 text-[11px] shadow-lg"
            style={{ left: Math.min(pad.l + band * hover + band / 2 + 8, Math.max(0, width - 160)) }}
          >
            <div className="text-ink-3">
              {categoryLabel} {categories[hover]}
            </div>
            <div>Observed: <b>{fmtInt(observed[hover])}</b></div>
            <div>Expected: <b>{fmtNum(expected[hover], 1)}</b></div>
            <div className="text-ink-3">
              Δ {fmtNum(observed[hover] - expected[hover], 1)}
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OBSERVED }} /> Observed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: EXPECTED }} /> Expected
        </span>
      </div>
    </div>
  );
}

/** Tiny inline bar strip (e.g. matches per recent draw). */
export function Strip({ values, max, threshold, label }: { values: number[]; max: number; threshold: number; label: string }) {
  return (
    <div className="flex h-10 items-end gap-px" role="img" aria-label={label}>
      {values.map((v, i) => (
        <div
          key={i}
          title={`${v} match${v === 1 ? '' : 'es'}`}
          className="min-w-0 flex-1 rounded-t-sm"
          style={{ height: `${Math.max(6, (v / Math.max(1, max)) * 100)}%`, background: v >= threshold ? '#39ff88' : '#24503d' }}
        />
      ))}
    </div>
  );
}
