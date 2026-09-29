import { useStore } from '../state/store';
import { Note, Panel, Stat, TileChips } from '../components/ui';
import { DistChart, LineChart, Strip } from '../components/charts';
import { TilePicker } from '../components/ConfigPanel';
import { Loading, useAnalysis } from './common';
import { RISK_LABEL } from '../core/payouts';
import { fmtInt, fmtNum, fmtP, fmtPct, fmtSigned, fmtMult } from '../lib/format';

export default function OverdueTab() {
  const a = useAnalysis();
  const config = useStore((s) => s.config);
  if (!a) return <Loading />;
  const set = a.set;

  if (!set || config.tiles.length === 0) {
    return (
      <Panel title="Tile-set tracker">
        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
          <TilePicker />
          <div className="space-y-3 text-ink-2">
            <p>
              Pick up to <b className="text-neon">{config.k}</b> tiles (K) to track. For every draw in the window the tracker counts how many of your tiles were drawn and treats
              draws with at least <b className="text-neon">{config.threshold}</b> matches as a hit.
            </p>
            <p>It reports the current and longest droughts, gap statistics against the hypergeometric expectation, and simulates betting the set on every draw.</p>
          </div>
        </div>
      </Panel>
    );
  }

  const g = set.gaps;
  const n = set.n;
  const partial = set.k !== config.k;
  const droughtTone = g.droughtProbability < 0.01 ? 'bad' : g.droughtProbability < 0.05 ? 'warn' : 'neutral';

  return (
    <div className="space-y-4">
      <Panel
        title="Tracked set"
        actions={
          <span className="text-[11px] text-ink-3">
            hit = ≥{set.threshold} of {set.k} · {RISK_LABEL[set.risk]} payouts
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <TileChips tiles={set.tiles} highlight={new Set(set.tiles)} />
          {partial && <span className="text-[11px] text-warn">Only {set.k} of K={config.k} tiles picked — stats use the {set.k}-spot table.</span>}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current drought" value={fmtInt(g.currentDrought)} sub={`expected gap ${fmtNum(g.expectedInterval, 1)}`} tone={g.overdueRatio >= 3 ? 'warn' : 'neutral'} />
        <Stat
          label="Overdue ratio"
          value={`${fmtNum(g.overdueRatio, 2)}×`}
          sub={`P(drought this long) ${fmtP(g.droughtProbability)}`}
          tone={droughtTone}
          title="Current drought ÷ expected interval. The probability is (1−p)^drought — how unusual the streak is, NOT the chance of a hit next round."
        />
        <Stat label="Longest drought" value={fmtInt(g.longestDrought)} sub={`in ${fmtInt(n)} draws`} />
        <Stat label="Hits" value={fmtInt(g.events)} sub={`${fmtPct(g.rate)} vs ${fmtPct(g.expectedRate)} · z ${fmtSigned(g.z, 2)}`} tone={Math.abs(g.z) >= 2 ? 'warn' : 'neutral'} />
        <Stat label="Mean gap" value={fmtNum(g.meanInterval, 2)} sub={`σ ${fmtNum(g.intervalStd, 2)} · expected ${fmtNum(g.expectedInterval, 2)}`} />
        <Stat label="Simulated RTP" value={fmtPct(set.sim.rtp)} sub={`95% band ${fmtPct(set.sim.ciLow, 1)}–${fmtPct(set.sim.ciHigh, 1)}`} tone={set.sim.rtp >= 1 ? 'good' : 'neutral'} />
        <Stat label="Net result" value={`${fmtSigned(set.sim.netUnits, 1)}u`} sub={`max drawdown ${fmtNum(set.sim.maxDrawdown, 1)}u`} tone={set.sim.netUnits >= 0 ? 'good' : 'bad'} />
        <Stat label="Win rate" value={fmtPct(set.sim.winRate)} sub={`best ${fmtMult(set.sim.bestMultiplier)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Matches per draw — observed vs expected">
          <DistChart
            categories={set.histogram.map((_, i) => String(i))}
            observed={set.histogram}
            expected={set.expectedProb.map((p) => p * n)}
            label="Distribution of matches per draw for the tracked set"
          />
          <p className="mt-2 text-[11px] text-ink-3">
            Goodness of fit χ² {fmtNum(set.distChi2, 2)} on {set.distDf} df · p = {fmtP(set.distChi2P)}
          </p>
        </Panel>
        <Panel title={`Last ${set.recentMatches.length} draws`}>
          <Strip values={set.recentMatches} max={set.k} threshold={set.threshold} label="Matches in recent draws; bright bars are hits" />
          <div className="mt-1 flex justify-between text-[10px] text-ink-3">
            <span>older</span>
            <span>newest</span>
          </div>
          <div className="mt-4">
            <div className="panel-title mb-1">Simulated profit (bet units)</div>
            <LineChart x={set.sim.series.x} y={set.sim.series.y} xOffset={a.range.start + 1} height={170} label="Simulated cumulative profit for the tracked set" valueLabel="Net" xLabel="Draw" />
          </div>
        </Panel>
      </div>

      <Note>
        Keno rounds are independent. A long drought is a description of the past; it does not make a hit more likely next round (the gambler’s fallacy). Use
        the drought probability to judge how unusual a streak is, and the χ² / z statistics to judge whether the data deviates from fair play.
      </Note>
    </div>
  );
}
