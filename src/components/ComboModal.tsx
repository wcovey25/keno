import { useEffect, useMemo, useState } from 'react';
import { Copy, Crosshair } from 'lucide-react';
import { useStore } from '../state/store';
import { closeDetail, copyTiles } from '../state/actions';
import { dataWorker } from '../workers/clients';
import type { ComboDetail } from '../workers/api';
import { RISK_LABEL } from '../core/payouts';
import { Board } from './Board';
import { LineChart } from './charts';
import { Modal, Stat, TileChips } from './ui';
import { cx, fmtInt, fmtMult, fmtNum, fmtPct, fmtSigned } from '../lib/format';

/** Board, per-level drought table and P&L timeline for one combination. */
export function ComboModal() {
  const detail = useStore((s) => s.detail);
  const source = useStore((s) => s.source);
  const range = useStore((s) => s.ranges[s.source]);
  const risk = useStore((s) => s.config.risk);
  const dataVersion = useStore((s) => s.dataVersion);
  const [data, setData] = useState<ComboDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tiles = detail?.tiles;
  const selected = useMemo(() => new Set(tiles ?? []), [tiles]);

  useEffect(() => {
    if (!tiles) return;
    let alive = true;
    setData(null);
    setError(null);
    dataWorker
      .call('comboDetail', { source, range, tiles, risk })
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [tiles, source, range, risk, dataVersion]);

  if (!tiles) return null;

  const trackInAdvanced = () => {
    const s = useStore.getState();
    s.setConfig({ k: Math.max(3, tiles.length), tiles, threshold: data?.threshold ?? s.config.threshold });
    s.set({ mode: 'advanced', tab: 'overdue', detail: null });
  };

  return (
    <Modal wide title={`${tiles.length}-tile combination · ${RISK_LABEL[risk]}`} onClose={closeDetail}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Board size="sm" selected={selected} label="Combination tiles" />
          <TileChips tiles={tiles} highlight={selected} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => copyTiles(tiles)}>
              <Copy size={14} /> Copy tiles
            </button>
            <button type="button" className="btn" onClick={trackInAdvanced}>
              <Crosshair size={14} /> Track in Advanced
            </button>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {error && <p className="text-bad">{error}</p>}
          {!data && !error && <p className="text-ink-3">Analyzing…</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Rounds analyzed" value={fmtInt(data.n)} />
                <Stat label="If played every round" value={fmtPct(data.set.sim.rtp)} sub={`RTP · ${fmtSigned(data.set.sim.netUnits, 1)}u net`} tone={data.set.sim.rtp >= 1 ? 'good' : 'neutral'} />
                <Stat label="Best win" value={fmtMult(data.set.sim.bestMultiplier)} sub={`win rate ${fmtPct(data.set.sim.winRate, 1)}`} />
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th className="num">Pays</th>
                      <th className="num" title="How often this happens on average">Every</th>
                      <th className="num" title="Actual hits vs expected hits">Hits</th>
                      <th className="num" title="Actual ÷ expected hits">Luck</th>
                      <th className="num" title="Rounds since it last happened">Last hit</th>
                      <th className="num" title="Last hit ÷ usual gap">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.levels.map((l) => (
                      <tr key={l.m} className={cx(l.m === data.threshold && 'bg-neon/5')}>
                        <td className={cx(l.m === data.threshold && 'text-neon')}>
                          {l.m}+ of {tiles.length}
                        </td>
                        <td className={cx('num', l.payout > 1 ? 'text-ink' : 'text-ink-3')}>{l.payout > 0 ? fmtMult(l.payout) : '—'}</td>
                        <td className="num">{fmtNum(l.expectedInterval, l.expectedInterval < 10 ? 1 : 0)}</td>
                        <td className="num">
                          {fmtInt(l.events)} <span className="text-ink-3">/ {fmtNum(l.expectedHits, 1)}</span>
                        </td>
                        <td className={cx('num', l.luck < 0.8 ? 'text-cold' : l.luck > 1.2 ? 'text-hot' : '')}>{fmtNum(l.luck, 2)}</td>
                        <td className="num">{fmtInt(l.currentDrought)}</td>
                        <td className={cx('num', l.overdue >= 2 && 'text-warn')}>{fmtNum(l.overdue, 2)}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="panel-title mb-1">Profit if played every round (bet units)</div>
                <LineChart x={data.set.sim.series.x} y={data.set.sim.series.y} xOffset={range.start + 1} height={180} label="Simulated cumulative profit" valueLabel="Net" xLabel="Round" />
              </div>
              <p className="text-[0.6875rem] text-ink-3">
                “Due” compares the current gap with the average gap. Every round is independent, so a long gap doesn’t raise the chance of a hit — it just makes the streak unusual.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
