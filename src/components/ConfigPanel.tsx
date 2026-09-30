import { useMemo, useState } from 'react';
import { Dices, Flame, Hourglass, Settings2, Snowflake, X } from 'lucide-react';
import { useStore } from '../state/store';
import { RISKS, RISK_LABEL, atLeastProbability } from '../core/payouts';
import { Board } from './Board';
import { Field, Panel, Seg } from './ui';
import { fmtNum, fmtPct, isWideScreen } from '../lib/format';

const DEPTHS = [10, 25, 50, 100];

export function TilePicker() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const toggleTile = useStore((s) => s.toggleTile);
  const tiles = useStore((s) => s.analysis?.tiles.tiles);
  const selected = useMemo(() => new Set(config.tiles), [config.tiles]);

  const pick = (by: 'hot' | 'cold' | 'overdue') => {
    if (!tiles) return;
    const sorted = [...tiles].sort((a, b) => (by === 'hot' ? b.z - a.z : by === 'cold' ? a.z - b.z : b.currentDrought - a.currentDrought));
    setConfig({ tiles: sorted.slice(0, config.k).map((t) => t.tile).sort((a, b) => a - b) });
  };
  const random = () => {
    const pool = Array.from({ length: 40 }, (_, i) => i);
    const out: number[] = [];
    for (let i = 0; i < config.k; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setConfig({ tiles: out.sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[0.6875rem]">
        <span className="text-ink-3">
          Tracked tiles{' '}
          <b className={config.tiles.length === config.k ? 'text-neon' : 'text-warn'}>
            {config.tiles.length}/{config.k}
          </b>
        </span>
        <div className="flex gap-1">
          <button type="button" className="btn px-1.5 py-0.5" title="Hottest K tiles" aria-label="Pick hottest tiles" disabled={!tiles} onClick={() => pick('hot')}>
            <Flame size={13} />
          </button>
          <button type="button" className="btn px-1.5 py-0.5" title="Coldest K tiles" aria-label="Pick coldest tiles" disabled={!tiles} onClick={() => pick('cold')}>
            <Snowflake size={13} />
          </button>
          <button type="button" className="btn px-1.5 py-0.5" title="Longest current droughts" aria-label="Pick most overdue tiles" disabled={!tiles} onClick={() => pick('overdue')}>
            <Hourglass size={13} />
          </button>
          <button type="button" className="btn px-1.5 py-0.5" title="Random K tiles" aria-label="Pick random tiles" onClick={random}>
            <Dices size={13} />
          </button>
          <button type="button" className="btn px-1.5 py-0.5" title="Clear" aria-label="Clear tracked tiles" disabled={!config.tiles.length} onClick={() => setConfig({ tiles: [] })}>
            <X size={13} />
          </button>
        </div>
      </div>
      <Board size="sm" selected={selected} onToggle={toggleTile} label="Tracked tile picker" />
    </div>
  );
}

export function ConfigPanel() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const [customDepth, setCustomDepth] = useState(!DEPTHS.includes(config.depth));
  const pHit = atLeastProbability(config.k, config.threshold);

  return (
    <Panel title="Configuration" icon={<Settings2 size={14} />} collapsible defaultOpen={isWideScreen()}>
      <div className="space-y-3">
        <Field group label="Spots (K)">
          <Seg
            label="Number of spots"
            value={config.k}
            onChange={(k) => setConfig({ k, threshold: Math.min(config.threshold, k) })}
            options={Array.from({ length: 8 }, (_, i) => ({ value: i + 3, label: String(i + 3) }))}
          />
        </Field>
        <Field group label="Risk profile">
          <Seg label="Risk profile" value={config.risk} onChange={(risk) => setConfig({ risk })} options={RISKS.map((r) => ({ value: r, label: RISK_LABEL[r] }))} />
        </Field>
        <Field
          group
          label="Overdue threshold (min matches)"
          hint={
            <>
              P(≥{config.threshold} of {config.k}) = {fmtPct(pHit)} · expect 1 in {fmtNum(1 / pHit, 1)} draws
            </>
          }
        >
          <Seg
            label="Minimum matches that count as a hit"
            value={config.threshold}
            onChange={(threshold) => setConfig({ threshold })}
            options={Array.from({ length: config.k }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Result depth">
            {customDepth ? (
              <input
                className="field tabular-nums"
                type="number"
                min={1}
                max={1000}
                value={config.depth}
                onChange={(e) => setConfig({ depth: Number(e.target.value) || 1 })}
                onBlur={() => DEPTHS.includes(config.depth) && setCustomDepth(false)}
              />
            ) : (
              <select
                className="field"
                value={config.depth}
                onChange={(e) => (e.target.value === 'custom' ? setCustomDepth(true) : setConfig({ depth: Number(e.target.value) }))}
              >
                {DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    Top {d}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            )}
          </Field>
          <Field label="Recent window">
            <input
              className="field tabular-nums"
              type="number"
              min={1}
              value={config.recentWindow}
              onChange={(e) => setConfig({ recentWindow: Number(e.target.value) || 1 })}
            />
          </Field>
        </div>
        <TilePicker />
      </div>
    </Panel>
  );
}
