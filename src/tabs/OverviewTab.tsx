import { Flame, Hourglass, Snowflake } from 'lucide-react';
import { useStore } from '../state/store';
import { Panel, Stat, TileChips } from '../components/ui';
import { LineChart } from '../components/charts';
import { HeatBoard, Loading, useAnalysis } from './common';
import { RISK_LABEL } from '../core/payouts';
import { fmtInt, fmtNum, fmtP, fmtPct, fmtSigned } from '../lib/format';
import type { TileStat } from '../core/stats';

function TopList({ title, icon, tiles, value, tone }: { title: string; icon: React.ReactNode; tiles: TileStat[]; value: (t: TileStat) => string; tone: 'hot' | 'cold' | 'neutral' }) {
  return (
    <Panel title={title} icon={icon} bodyClass="p-2">
      <ul className="space-y-1">
        {tiles.map((t) => (
          <li key={t.tile} className="flex items-center justify-between gap-2 px-1 text-[0.75rem]">
            <TileChips tiles={[t.tile]} tone={tone} />
            <span className="tabular-nums text-ink-2">{value(t)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function OverviewTab() {
  const a = useAnalysis();
  const config = useStore((s) => s.config);
  const setTab = useStore((s) => s.setTab);
  if (!a) return <Loading />;
  const t = a.tiles;
  const byZ = [...t.tiles].sort((x, y) => y.z - x.z);
  const byDrought = [...t.tiles].sort((x, y) => y.currentDrought - x.currentDrought);
  const rtp = a.archiveRtp;
  const set = a.set;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Draws in window" value={fmtInt(t.n)} sub={`#${fmtInt(a.range.start + 1)} → #${fmtInt(a.range.end + 1)}`} />
        <Stat
          label="Uniformity χ² p-value"
          value={fmtP(t.chi2P)}
          tone={t.chi2P < 0.001 ? 'bad' : t.chi2P < 0.05 ? 'warn' : 'good'}
          sub={`χ² ${fmtNum(t.chi2, 1)} on ${t.df} df`}
          title="Tests whether all 40 squares are drawn equally often, corrected for drawing 10 of 40 without replacement. Small p (<0.05) = unusual deviation."
        />
        {rtp ? (
          <Stat
            label="Actual RTP (bet units)"
            value={fmtPct(rtp.rtp)}
            tone={rtp.rtp >= 1 ? 'good' : 'neutral'}
            sub={`theoretical ${fmtPct(rtp.theoreticalRtp)} · net ${fmtSigned(rtp.netUnits, 1)}u`}
          />
        ) : (
          <Stat label="Mean repeats / draw" value={fmtNum(t.meanRepeats, 3)} sub="expected 2.500" />
        )}
        {set ? (
          <Stat
            label={`Tracked set · ${RISK_LABEL[set.risk]}`}
            value={fmtPct(set.sim.rtp)}
            tone={set.sim.rtp >= 1 ? 'good' : 'neutral'}
            sub={`sim RTP · drought ${fmtInt(set.gaps.currentDrought)} (${fmtNum(set.gaps.overdueRatio, 2)}×)`}
          />
        ) : (
          <Stat label="Tracked set" value={`${config.tiles.length}/${config.k}`} sub="pick tiles to simulate" tone="warn" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title="Board heatmap">
          <HeatBoard />
        </Panel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <TopList title="Hot" icon={<Flame size={14} />} tiles={byZ.slice(0, 6)} tone="hot" value={(x) => `${fmtInt(x.count)} · z ${fmtSigned(x.z, 1)}`} />
          <TopList title="Cold" icon={<Snowflake size={14} />} tiles={byZ.slice(-6).reverse()} tone="cold" value={(x) => `${fmtInt(x.count)} · z ${fmtSigned(x.z, 1)}`} />
          <TopList title="Longest drought" icon={<Hourglass size={14} />} tiles={byDrought.slice(0, 6)} tone="neutral" value={(x) => `${fmtInt(x.currentDrought)} draws`} />
        </div>
      </div>

      {rtp && rtp.series.x.length > 1 && (
        <Panel title="Cumulative profit (bet units)" actions={<button type="button" className="btn px-2 py-0.5 text-[0.6875rem]" onClick={() => setTab('rtp')}>RTP details →</button>}>
          <LineChart x={rtp.series.x} y={rtp.series.y} label="Cumulative profit of archive bets in bet units" valueLabel="Net" xOffset={a.range.start + 1} />
        </Panel>
      )}
      {!rtp && set && set.sim.series.x.length > 1 && (
        <Panel title={`Simulated profit — tracked set on ${RISK_LABEL[set.risk]}`} actions={<button type="button" className="btn px-2 py-0.5 text-[0.6875rem]" onClick={() => setTab('overdue')}>Tracker →</button>}>
          <LineChart x={set.sim.series.x} y={set.sim.series.y} label="Simulated cumulative profit in bet units" valueLabel="Net" xOffset={a.range.start + 1} xLabel="Round" />
        </Panel>
      )}
    </div>
  );
}
