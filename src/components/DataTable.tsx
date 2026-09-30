import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cx } from '../lib/format';

export interface Column<T> {
  key: string;
  label: ReactNode;
  render: (row: T, index: number) => ReactNode;
  sort?: (row: T) => number | string;
  numeric?: boolean;
  title?: string;
}

/** Sortable, depth-limited table with optional pagination. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  pageSize,
  empty = 'No rows',
  onRowClick,
  maxHeight,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, i: number) => string | number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  maxHeight?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    const out = [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? (Number.isNaN(va) ? 1 : Number.isNaN(vb) ? -1 : va - vb) : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, columns, sort]);

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const visible = pageSize ? sorted.slice(current * pageSize, (current + 1) * pageSize) : sorted;

  return (
    <div>
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={cx(c.numeric && 'num')} title={c.title} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort ? (
                      <button
                        type="button"
                        className={cx('inline-flex items-center gap-1 uppercase hover:text-ink', active && 'text-neon')}
                        onClick={() => {
                          setPage(0);
                          setSort(active ? { key: c.key, dir: sort!.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.numeric ? 'desc' : 'asc' });
                        }}
                      >
                        {c.label}
                        {active && (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-ink-3">
                  {empty}
                </td>
              </tr>
            )}
            {visible.map((r, i) => (
              <tr key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && 'cursor-pointer')}>
                {columns.map((c) => (
                  <td key={c.key} className={cx(c.numeric && 'num tabular-nums')}>
                    {c.render(r, (pageSize ? current * pageSize : 0) + i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-[0.6875rem] text-ink-3">
          <button type="button" className="btn px-2 py-0.5" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Prev
          </button>
          <span className="tabular-nums">
            {current + 1} / {pages}
          </span>
          <button type="button" className="btn px-2 py-0.5" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
