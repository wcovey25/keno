import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { dataWorker } from '../workers/clients';
import { Panel, TileChips } from '../components/ui';
import type { DrawRow } from '../core/exporters';
import { fmtDate, fmtInt, fmtMult } from '../lib/format';

export default function LogTab() {
  const source = useStore((s) => s.source);
  const range = useStore((s) => s.ranges[s.source]);
  const depth = useStore((s) => s.config.depth);
  const tracked = useStore((s) => s.config.tiles);
  const dataVersion = useStore((s) => s.dataVersion);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; rows: DrawRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trackedLabels = useMemo(() => new Set(tracked.map((t) => t + 1)), [tracked]);

  useEffect(() => setPage(0), [source, range.start, range.end, depth]);

  useEffect(() => {
    let alive = true;
    dataWorker
      .call('draws', { source, range, offset: page * depth, limit: depth })
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [source, range, page, depth, dataVersion]);

  const pages = data ? Math.max(1, Math.ceil(data.total / depth)) : 1;
  const isArchive = source === 'archive';

  return (
    <Panel
      title="Draw log (newest first)"
      actions={
        <div className="flex items-center gap-2 text-[0.6875rem] text-ink-3">
          <button type="button" className="btn px-2 py-0.5" disabled={page === 0} onClick={() => setPage(0)}>
            Newest
          </button>
          <button type="button" className="btn px-2 py-0.5" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span className="tabular-nums">
            {page + 1} / {pages}
          </span>
          <button type="button" className="btn px-2 py-0.5" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      }
      bodyClass="p-0"
    >
      {error && <p className="p-3 text-bad">{error}</p>}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">#</th>
              {isArchive && <th>Time</th>}
              <th className="num">Nonce</th>
              <th>Drawn</th>
              {isArchive && <th>Picks</th>}
              {isArchive && <th className="num">Hits</th>}
              {isArchive && <th>Risk</th>}
              {isArchive && <th className="num">Mult</th>}
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => {
              const picks = new Set(r.selected);
              return (
                <tr key={r.index}>
                  <td className="num tabular-nums text-ink-3">{fmtInt(r.index + 1)}</td>
                  {isArchive && <td className="text-ink-2">{r.time ? fmtDate(Date.parse(r.time)) : '—'}</td>}
                  <td className="num tabular-nums">{fmtInt(r.nonce)}</td>
                  <td>
                    <TileChips tiles={[...r.drawn].sort((a, b) => a - b).map((x) => x - 1)} highlight={new Set([...(isArchive ? picks : trackedLabels)].map((x) => x - 1))} />
                  </td>
                  {isArchive && (
                    <td>
                      <TileChips tiles={[...r.selected].sort((a, b) => a - b).map((x) => x - 1)} />
                    </td>
                  )}
                  {isArchive && <td className="num tabular-nums">{r.hits ?? '—'}</td>}
                  {isArchive && <td className="text-ink-2">{r.risk ?? '—'}</td>}
                  {isArchive && <td className={`num tabular-nums ${r.multiplier && r.multiplier > 1 ? 'text-neon' : ''}`}>{fmtMult(r.multiplier)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[0.6875rem] text-ink-3">Highlighted squares: {isArchive ? 'your picks that were drawn' : 'tracked tiles that were drawn'}. Page size = result depth.</p>
    </Panel>
  );
}
