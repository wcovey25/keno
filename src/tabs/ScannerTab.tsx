import { useMemo } from 'react';
import { Crosshair, Download, Play, Square } from 'lucide-react';
import { useStore, type PoolMode } from '../state/store';
import { cancelScan, exportScan, runScan, scanPool, scanSignature } from '../state/actions';
import { Badge, Field, Note, Panel, ProgressBar, Seg, TileChips } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { choose } from '../core/payouts';
import type { ComboResult, ScanSort } from '../core/scanner';
import { fmtInt, fmtNum, fmtP, fmtPct, fmtSigned } from '../lib/format';

const SORTS: { value: ScanSort; label: string; title: string }[] = [
  { value: 'overdue', label: 'Overdue×', title: 'Current drought ÷ expected interval' },
  { value: 'drought', label: 'Drought', title: 'Current drought length' },
  { value: 'longest', label: 'Longest', title: 'Longest drought in window' },
  { value: 'hot', label: 'Hot', title: 'Most hits vs expected (z)' },
  { value: 'cold', label: 'Cold', title: 'Fewest hits vs expected (z)' },
  { value: 'rtp', label: 'RTP', title: 'Highest simulated RTP' },
];

const POOLS: { value: PoolMode; label: string }[] = [
  { value: 'all', label: 'All 40' },
  { value: 'hot', label: 'Hot N' },
  { value: 'cold', label: 'Cold N' },
  { value: 'overdue', label: 'Overdue N' },
  { value: 'selection', label: 'Tracked' },
];

export default function ScannerTab() {
  const config = useStore((s) => s.config);
  const scanConfig = useStore((s) => s.scanConfig);
  const setScanConfig = useStore((s) => s.setScanConfig);
  const setConfig = useStore((s) => s.setConfig);
  const setTab = useStore((s) => s.setTab);
  const scan = useStore((s) => s.scan);
  const analysis = useStore((s) => s.analysis);
  // Re-derive when anything that feeds the signature changes.
  const signature = useStore(() => scanSignature());
  const pool = useMemo(() => scanPool(), [analysis, config.tiles, config.k, scanConfig.poolMode, scanConfig.poolSize]);

  const n = analysis ? analysis.range.end - analysis.range.start + 1 : 0;
  const space = choose(pool.length, config.k);
  const exhaustive = space <= scanConfig.maxCombos;
  const combos = exhaustive ? space : scanConfig.maxCombos;
  const workUnits = combos * Math.ceil(n / 32) * config.k;
  const estSeconds = workUnits / 6e7; // measured ≈ 6e7 word-ops/s (k × 32-draw words) on one core
  const stale = scan.result && scan.signature !== signature;
  const running = scan.status === 'running';
  const r = scan.result;

  const cols: Column<ComboResult>[] = [
    { key: 'rank', label: '#', render: (_, i) => <span className="text-ink-3">{i + 1}</span> },
    { key: 'tiles', label: 'Tiles', render: (c) => <TileChips tiles={c.tiles} /> },
    { key: 'events', label: 'Hits', numeric: true, render: (c) => fmtInt(c.events), sort: (c) => c.events },
    { key: 'rate', label: 'Rate', numeric: true, render: (c) => fmtPct(c.rate), sort: (c) => c.rate },
    { key: 'z', label: 'z', numeric: true, render: (c) => fmtSigned(c.z, 2), sort: (c) => c.z },
    { key: 'drought', label: 'Drought', numeric: true, render: (c) => fmtInt(c.currentDrought), sort: (c) => c.currentDrought },
    { key: 'longest', label: 'Longest', numeric: true, render: (c) => fmtInt(c.longestDrought), sort: (c) => c.longestDrought },
    { key: 'gap', label: 'Mean gap', numeric: true, render: (c) => fmtNum(c.meanInterval, 1), sort: (c) => c.meanInterval },
    { key: 'overdue', label: 'Overdue×', numeric: true, render: (c) => fmtNum(c.overdueRatio, 2), sort: (c) => c.overdueRatio },
    { key: 'p', label: 'P(drought)', numeric: true, render: (c) => fmtP(c.droughtProbability), sort: (c) => c.droughtProbability },
    { key: 'rtp', label: 'Sim RTP', numeric: true, render: (c) => <span className={c.rtp >= 1 ? 'text-neon' : ''}>{fmtPct(c.rtp, 1)}</span>, sort: (c) => c.rtp },
    {
      key: 'track',
      label: '',
      render: (c) => (
        <button
          type="button"
          className="btn px-1.5 py-0.5 text-[11px]"
          onClick={(e) => {
            e.stopPropagation();
            setConfig({ tiles: c.tiles });
            setTab('overdue');
          }}
        >
          Track
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Panel title="Combination scanner" icon={<Crosshair size={14} />}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Rank by">
              <Seg label="Rank combinations by" value={scanConfig.sort} onChange={(sort) => setScanConfig({ sort })} options={SORTS} />
            </Field>
            <Field label="Candidate pool">
              <div className="flex flex-wrap items-center gap-2">
                <Seg label="Candidate pool" value={scanConfig.poolMode} onChange={(poolMode) => setScanConfig({ poolMode })} options={POOLS} />
                {['hot', 'cold', 'overdue'].includes(scanConfig.poolMode) && (
                  <input
                    type="number"
                    className="field w-20 tabular-nums"
                    aria-label="Pool size"
                    min={config.k}
                    max={40}
                    value={scanConfig.poolSize}
                    onChange={(e) => setScanConfig({ poolSize: Math.max(config.k, Math.min(40, Number(e.target.value) || config.k)) })}
                  />
                )}
              </div>
            </Field>
            <div className="text-[11px] text-ink-3">
              Pool: <TileChips tiles={pool} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Max combos">
                <input type="number" className="field tabular-nums" min={100} step={1000} value={scanConfig.maxCombos} onChange={(e) => setScanConfig({ maxCombos: Math.max(100, Number(e.target.value) || 100) })} />
              </Field>
              <Field label="Min hits">
                <input type="number" className="field tabular-nums" min={0} value={scanConfig.minEvents} onChange={(e) => setScanConfig({ minEvents: Math.max(0, Number(e.target.value) || 0) })} />
              </Field>
              <Field label="Sample seed">
                <input type="number" className="field tabular-nums" value={scanConfig.seed} onChange={(e) => setScanConfig({ seed: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <div className="space-y-1 text-[12px] text-ink-2">
              <div>
                Search space C({pool.length}, {config.k}) = <b className="text-ink">{fmtInt(space)}</b> →{' '}
                {exhaustive ? <Badge tone="good">exhaustive</Badge> : <Badge tone="warn">random sample of {fmtInt(combos)}</Badge>}
              </div>
              <div className="text-ink-3">
                {fmtInt(n)} draws · hit = ≥{config.threshold} of {config.k} · top {config.depth} · est. {estSeconds < 1 ? '< 1 s' : `~${fmtNum(estSeconds, 0)} s`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {running ? (
                <button type="button" className="btn btn-danger" onClick={cancelScan}>
                  <Square size={14} /> Cancel
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!analysis || pool.length < config.k} onClick={() => void runScan()}>
                  <Play size={14} /> Run scan
                </button>
              )}
              {r && (
                <>
                  <button type="button" className="btn" onClick={() => exportScan('csv')}>
                    <Download size={14} /> CSV
                  </button>
                  <button type="button" className="btn" onClick={() => exportScan('json')}>
                    <Download size={14} /> JSON
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {running && (
          <div className="mt-3 space-y-1">
            <ProgressBar value={scan.progress ? scan.progress.done / Math.max(1, scan.progress.total) : null} label="Scan progress" />
            <div className="text-[11px] text-ink-3 tabular-nums">
              {scan.progress ? `${fmtInt(scan.progress.done)} / ${fmtInt(scan.progress.total)} combinations` : 'Preparing…'}
            </div>
          </div>
        )}
        {scan.status === 'error' && <div className="mt-3"><Note tone="bad">{scan.error}</Note></div>}
      </Panel>

      {r && (
        <Panel
          title={`Results — top ${r.results.length}`}
          actions={
            <>
              {stale && <Badge tone="warn">settings changed — re-run</Badge>}
              <span className="text-[11px] text-ink-3">
                {fmtInt(r.scanned)} {r.mode} · {fmtNum(r.elapsedMs / 1000, 2)} s · expected rate {fmtPct(r.expectedRate)} · theo RTP {fmtPct(r.theoreticalRtp)}
              </span>
            </>
          }
          bodyClass="p-0"
        >
          <DataTable rows={r.results} columns={cols} rowKey={(c) => c.tiles.join('-')} empty="No combination met the minimum hits filter." maxHeight={640} />
        </Panel>
      )}
      <Note>
        With thousands of combinations, some will always look extreme by chance alone (multiple comparisons). A top-ranked “overdue” combo is expected even on
        perfectly fair data; it carries no predictive power for the next draw.
      </Note>
    </div>
  );
}
