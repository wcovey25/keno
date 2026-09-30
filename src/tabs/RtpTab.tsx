import { useState } from 'react';
import { useStore } from '../state/store';
import { Badge, Note, Panel, Seg, Stat, TileChips } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { LineChart } from '../components/charts';
import { Loading, useAnalysis } from './common';
import { PAYOUTS, RISKS, RISK_LABEL, theoreticalRtp, type Risk } from '../core/payouts';
import type { CurrencyRow, RtpGroup } from '../core/stats';
import { cx, fmtInt, fmtMult, fmtNum, fmtPct, fmtSigned } from '../lib/format';

function PayoutMatrix() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const [risk, setRisk] = useState<Risk>(config.risk);
  const table = PAYOUTS[risk];
  return (
    <Panel
      title="Payout table"
      actions={<Seg label="Payout table risk" value={risk} onChange={setRisk} options={RISKS.map((r) => ({ value: r, label: RISK_LABEL[r] }))} />}
      bodyClass="p-0"
    >
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Picks</th>
              {Array.from({ length: 11 }, (_, h) => (
                <th key={h} className="num">
                  {h}
                </th>
              ))}
              <th className="num">RTP</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const picks = i + 1;
              const active = picks === config.k && risk === config.risk;
              return (
                <tr
                  key={picks}
                  className={cx('cursor-pointer', active && 'bg-neon/5')}
                  onClick={() => picks >= 3 && setConfig({ k: picks, risk })}
                  title={picks >= 3 ? 'Use this K and risk' : undefined}
                >
                  <td className={cx(active && 'text-neon')}>{picks}</td>
                  {Array.from({ length: 11 }, (_, h) => (
                    <td key={h} className={cx('num tabular-nums', row[h] === undefined ? 'text-line' : row[h] === 0 ? 'text-ink-3' : row[h] >= 100 ? 'text-hot' : row[h] >= 1 ? 'text-ink' : 'text-ink-2')}>
                      {row[h] === undefined ? '' : row[h] === 0 ? '0' : fmtMult(row[h])}
                    </td>
                  ))}
                  <td className="num tabular-nums text-ink-2">{fmtPct(theoreticalRtp(risk, picks))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const inBand = (g: RtpGroup) => (Number.isNaN(g.ciLow) ? null : g.rtp >= g.ciLow && g.rtp <= g.ciHigh);

const groupCols: Column<RtpGroup>[] = [
  { key: 'risk', label: 'Risk', render: (g) => (g.risk === 'unknown' ? '—' : RISK_LABEL[g.risk]), sort: (g) => g.risk },
  { key: 'picks', label: 'Picks', numeric: true, render: (g) => g.picks, sort: (g) => g.picks },
  { key: 'bets', label: 'Bets', numeric: true, render: (g) => fmtInt(g.bets), sort: (g) => g.bets },
  { key: 'wins', label: 'Win %', numeric: true, render: (g) => fmtPct(g.wins / g.bets, 1), sort: (g) => g.wins / g.bets },
  { key: 'rtp', label: 'Actual', numeric: true, render: (g) => <span className={g.rtp >= 1 ? 'text-neon' : ''}>{fmtPct(g.rtp)}</span>, sort: (g) => g.rtp },
  { key: 'theo', label: 'Theoretical', numeric: true, render: (g) => fmtPct(g.theoreticalRtp), sort: (g) => g.theoreticalRtp },
  {
    key: 'band',
    label: '95% band',
    numeric: true,
    render: (g) => {
      const ok = inBand(g);
      return (
        <span className="inline-flex items-center gap-2">
          {fmtPct(g.ciLow, 1)}–{fmtPct(g.ciHigh, 1)}
          {ok === null ? null : ok ? <Badge tone="good">in</Badge> : <Badge tone="warn">out</Badge>}
        </span>
      );
    },
    title: 'Normal approximation of where 95% of fair outcomes land for this many bets. Payouts are heavy-tailed, so treat small groups (< a few hundred bets) as indicative only.',
  },
];

const currencyCols: Column<CurrencyRow>[] = [
  { key: 'c', label: 'Currency', render: (c) => c.currency.toUpperCase(), sort: (c) => c.currency },
  { key: 'bets', label: 'Bets', numeric: true, render: (c) => fmtInt(c.bets), sort: (c) => c.bets },
  { key: 'w', label: 'Wagered', numeric: true, render: (c) => fmtNum(c.wagered, 8).replace(/\.?0+$/, ''), sort: (c) => c.wagered },
  { key: 'r', label: 'Returned', numeric: true, render: (c) => fmtNum(c.returned, 8).replace(/\.?0+$/, ''), sort: (c) => c.returned },
  { key: 'p', label: 'Profit', numeric: true, render: (c) => <span className={c.profit >= 0 ? 'text-neon' : 'text-bad'}>{fmtNum(c.profit, 8).replace(/\.?0+$/, '')}</span>, sort: (c) => c.profit },
  { key: 'rtp', label: 'RTP', numeric: true, render: (c) => fmtPct(c.rtp), sort: (c) => c.rtp },
];

export default function RtpTab() {
  const a = useAnalysis();
  const source = useStore((s) => s.source);
  const setTab = useStore((s) => s.setTab);
  if (!a) return <Loading />;
  const rtp = a.archiveRtp;

  return (
    <div className="space-y-4">
      {source === 'archive' && rtp && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Actual RTP (bet units)" value={fmtPct(rtp.rtp)} tone={rtp.rtp >= 1 ? 'good' : 'neutral'} sub={`theoretical ${fmtPct(rtp.theoreticalRtp)}`} title="Mean payout multiplier — currency-independent" />
            <Stat label="Net result" value={`${fmtSigned(rtp.netUnits, 1)}u`} tone={rtp.netUnits >= 0 ? 'good' : 'bad'} sub={`max drawdown ${fmtNum(rtp.maxDrawdown, 1)}u`} />
            <Stat label="Win rate" value={fmtPct(rtp.winRate)} sub={`${fmtInt(rtp.scored)} bets scored`} />
            <Stat
              label="Streaks"
              value={`${rtp.longestWinStreak}W / ${rtp.longestLossStreak}L`}
              sub={`current ${rtp.currentStreak >= 0 ? `${rtp.currentStreak}W` : `${-rtp.currentStreak}L`}`}
            />
          </div>
          {rtp.derivedMultipliers > 0 && <Note>{fmtInt(rtp.derivedMultipliers)} bets had no payout multiplier in the export — derived from the payout table.</Note>}
          {rtp.mismatchCount > 0 && (
            <Note tone="warn">
              {fmtInt(rtp.mismatchCount)} bets report a multiplier that differs from the current payout table (older table version, or a data issue). First:{' '}
              {rtp.mismatches.slice(0, 5).map((m) => `#${m.index + 1} reported ${fmtMult(m.reported)} vs ${fmtMult(m.expected)}`).join(' · ')}
            </Note>
          )}
          <Panel title="Cumulative profit (bet units)">
            <LineChart x={rtp.series.x} y={rtp.series.y} label="Cumulative profit in bet units" valueLabel="Net" xOffset={a.range.start + 1} height={240} />
          </Panel>
          <Panel title="By risk × picks" bodyClass="p-0">
            <DataTable rows={rtp.groups} columns={groupCols} rowKey={(g) => `${g.risk}-${g.picks}`} initialSort={{ key: 'bets', dir: 'desc' }} />
          </Panel>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="By currency (weighted by stake)" bodyClass="p-0">
              <DataTable rows={rtp.currencies} columns={currencyCols} rowKey={(c) => c.currency} empty="No amounts in export" />
            </Panel>
            <Panel title={`Top wins (depth ${rtp.topWins.length})`} bodyClass="p-0">
              <DataTable
                rows={rtp.topWins}
                rowKey={(w) => w.index}
                maxHeight={360}
                columns={[
                  { key: 'i', label: 'Bet #', numeric: true, render: (w) => fmtInt(w.index + 1) },
                  { key: 'm', label: 'Mult', numeric: true, render: (w) => <span className="text-neon">{fmtMult(w.multiplier)}</span> },
                  { key: 'h', label: 'Hits', numeric: true, render: (w) => `${w.hits}/${w.picks}` },
                  { key: 'r', label: 'Risk', render: (w) => w.risk },
                ]}
              />
            </Panel>
          </div>
        </>
      )}
      {source === 'pf' && (
        <Note>
          Generated provably-fair rounds have no bets attached. Use the <button type="button" className="text-cyan underline" onClick={() => setTab('overdue')}>Tracker</button> to
          simulate betting a tile set on these rounds{a.set ? (
            <>
              {' '}— currently <TileChips tiles={a.set.tiles} /> returns <b>{fmtPct(a.set.sim.rtp)}</b> vs {fmtPct(a.set.sim.theoreticalRtp)} theoretical.
            </>
          ) : '.'}
        </Note>
      )}
      <PayoutMatrix />
    </div>
  );
}
