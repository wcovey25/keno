import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useStore } from '../state/store';
import { exportData, exportScan } from '../state/actions';
import { Panel } from '../components/ui';
import { fmtInt } from '../lib/format';
import type { ReactNode } from 'react';

function Card({ title, desc, children }: { title: string; desc: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title} icon={<Download size={14} />}>
      <p className="mb-3 min-h-10 text-[0.75rem] text-ink-2">{desc}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </Panel>
  );
}

export default function ExportTab() {
  const source = useStore((s) => s.source);
  const range = useStore((s) => s.ranges[s.source]);
  const archive = useStore((s) => s.archive);
  const scan = useStore((s) => s.scan.result);
  const busy = useStore((s) => s.task !== null);
  const n = range.end - range.start + 1;
  const csv = (
    <>
      <FileSpreadsheet size={14} /> CSV
    </>
  );
  const json = (
    <>
      <FileJson size={14} /> JSON
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <Card title="Draws in window" desc={`${fmtInt(n)} ${source === 'archive' ? 'bets' : 'rounds'} with drawn squares (1–40), picks, multipliers.`}>
        <button type="button" className="btn" disabled={busy} onClick={() => void exportData('draws', 'csv')}>{csv}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void exportData('draws', 'json')}>{json}</button>
      </Card>
      <Card title="Tile statistics" desc="Per-square counts, z-scores, droughts, gap statistics and pair co-occurrence for the window.">
        <button type="button" className="btn" disabled={busy} onClick={() => void exportData('tiles', 'csv')}>{csv}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void exportData('tiles', 'json')}>{json}</button>
      </Card>
      <Card title="Full analysis summary" desc="Everything on screen — tiles, tracked set, RTP breakdown and configuration — as one JSON document.">
        <button type="button" className="btn" disabled={busy} onClick={() => void exportData('analysis', 'json')}>{json}</button>
      </Card>
      <Card title="Merged archive backup" desc={archive ? `${fmtInt(archive.count)} deduplicated bets from ${archive.files.length} file(s), re-importable here.` : 'Load an archive first.'}>
        <button type="button" className="btn" disabled={busy || !archive?.count} onClick={() => void exportData('archive', 'json')}>{json}</button>
      </Card>
      <Card title="Scanner results" desc={scan ? `${scan.results.length} ranked combinations from the last scan.` : 'Run a scan first.'}>
        <button type="button" className="btn" disabled={!scan} onClick={() => exportScan('csv')}>{csv}</button>
        <button type="button" className="btn" disabled={!scan} onClick={() => exportScan('json')}>{json}</button>
      </Card>
    </div>
  );
}
