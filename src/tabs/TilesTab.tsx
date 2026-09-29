import { useStore } from '../state/store';
import { Panel, Stat, TileChips } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { DistChart } from '../components/charts';
import { HeatBoard, Loading, useAnalysis } from './common';
import type { PairStat, TileStat } from '../core/stats';
import { cx, fmtInt, fmtNum, fmtPct, fmtSigned } from '../lib/format';

const zTone = (z: number) => (z >= 2 ? 'text-hot' : z <= -2 ? 'text-cold' : '');

const tileCols: Column<TileStat>[] = [
  { key: 'tile', label: 'Tile', render: (t) => <TileChips tiles={[t.tile]} />, sort: (t) => t.tile },
  { key: 'count', label: 'Count', numeric: true, render: (t) => fmtInt(t.count), sort: (t) => t.count },
  { key: 'rate', label: 'Rate', numeric: true, render: (t) => fmtPct(t.rate), sort: (t) => t.rate, title: 'Expected 25%' },
  { key: 'z', label: 'z', numeric: true, render: (t) => <span className={zTone(t.z)}>{fmtSigned(t.z, 2)}</span>, sort: (t) => t.z, title: 'Standard deviations from expected count' },
  { key: 'recent', label: 'Recent', numeric: true, render: (t) => fmtInt(t.recent), sort: (t) => t.recent },
  { key: 'recentZ', label: 'Recent z', numeric: true, render: (t) => <span className={zTone(t.recentZ)}>{fmtSigned(t.recentZ, 2)}</span>, sort: (t) => t.recentZ },
  { key: 'drought', label: 'Drought', numeric: true, render: (t) => fmtInt(t.currentDrought), sort: (t) => t.currentDrought, title: 'Draws since last seen' },
  { key: 'longest', label: 'Longest', numeric: true, render: (t) => fmtInt(t.longestDrought), sort: (t) => t.longestDrought },
  { key: 'interval', label: 'Mean gap', numeric: true, render: (t) => fmtNum(t.meanInterval, 2), sort: (t) => t.meanInterval, title: 'Mean interval between appearances (expected 4.00)' },
  { key: 'std', label: 'Gap σ', numeric: true, render: (t) => fmtNum(t.intervalStd, 2), sort: (t) => t.intervalStd, title: 'Std. dev. of intervals (geometric: √12 ≈ 3.46)' },
  { key: 'overdue', label: 'Overdue×', numeric: true, render: (t) => <span className={cx(t.overdueRatio >= 3 && 'text-warn')}>{fmtNum(t.overdueRatio, 2)}</span>, sort: (t) => t.overdueRatio },
];

const pairCols: Column<PairStat>[] = [
  { key: 'pair', label: 'Pair', render: (p) => <TileChips tiles={[p.a, p.b]} /> },
  { key: 'count', label: 'Together', numeric: true, render: (p) => fmtInt(p.count) },
  { key: 'z', label: 'z', numeric: true, render: (p) => <span className={zTone(p.z)}>{fmtSigned(p.z, 2)}</span> },
];

export default function TilesTab() {
  const a = useAnalysis();
  const depth = useStore((s) => s.config.depth);
  if (!a) return <Loading />;
  const t = a.tiles;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Frequency map">
          <HeatBoard />
        </Panel>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Mean sum" value={fmtNum(t.meanSum, 1)} sub="expected 205.0" />
            <Stat label="Mean odd" value={fmtNum(t.meanOdd, 2)} sub="expected 5.00" />
            <Stat label="Repeats" value={fmtNum(t.meanRepeats, 2)} sub="expected 2.50" />
          </div>
          <Panel title="Rows (1–8, 9–16, …)">
            <DistChart categories={t.rows.map((r) => `R${r.index + 1}`)} observed={t.rows.map((r) => r.count)} expected={t.rows.map((r) => r.expected)} label="Draw count per board row vs expected" categoryLabel="Row" height={140} />
          </Panel>
          <Panel title="Columns">
            <DistChart categories={t.cols.map((c) => `C${c.index + 1}`)} observed={t.cols.map((c) => c.count)} expected={t.cols.map((c) => c.expected)} label="Draw count per board column vs expected" categoryLabel="Column" height={140} />
          </Panel>
        </div>
      </div>
      <Panel title="All 40 tiles" bodyClass="p-0">
        <DataTable rows={t.tiles} columns={tileCols} rowKey={(r) => r.tile} initialSort={{ key: 'tile', dir: 'asc' }} maxHeight={520} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Most frequent pairs (top ${Math.min(depth, t.topPairs.length)})`} bodyClass="p-0">
          <DataTable rows={t.topPairs} columns={pairCols} rowKey={(p) => `${p.a}-${p.b}`} maxHeight={420} />
        </Panel>
        <Panel title="Rarest pairs" bodyClass="p-0">
          <DataTable rows={t.coldPairs} columns={pairCols} rowKey={(p) => `${p.a}-${p.b}`} maxHeight={420} />
        </Panel>
      </div>
    </div>
  );
}
