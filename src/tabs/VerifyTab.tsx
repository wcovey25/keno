import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useStore } from '../state/store';
import { runVerify } from '../state/actions';
import { Board } from '../components/Board';
import { Badge, Field, Note, Panel, Stat, TileChips } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { checkServerSeedHash, createKenoGenerator } from '../core/provablyFair';
import { fmtInt, fmtPct } from '../lib/format';

function SingleRound() {
  const tracked = useStore((s) => s.config.tiles);
  const [serverSeed, setServerSeed] = useState('');
  const [hashed, setHashed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');

  // One round is two HMACs — cheap enough to compute synchronously on input.
  const result = useMemo(() => {
    const n = Number(nonce);
    if (!serverSeed || !Number.isSafeInteger(n) || n < 0) return null;
    return {
      drawn: createKenoGenerator(serverSeed, clientSeed).draw(n),
      check: checkServerSeedHash(serverSeed, hashed),
    };
  }, [serverSeed, clientSeed, nonce, hashed]);
  const selected = useMemo(() => new Set(tracked), [tracked]);
  const drawnSet = useMemo(() => new Set(result?.drawn ?? []), [result]);
  const hits = tracked.filter((t) => drawnSet.has(t)).length;

  return (
    <Panel title="Verify a single round" icon={<ShieldCheck size={14} />}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="space-y-2.5">
          <Field label="Server seed (unhashed)">
            <input className="field font-mono text-[0.75rem]" spellCheck={false} autoComplete="off" value={serverSeed} onChange={(e) => setServerSeed(e.target.value.trim())} />
          </Field>
          <Field label="Hashed server seed (optional)">
            <input className="field font-mono text-[0.75rem]" spellCheck={false} autoComplete="off" value={hashed} onChange={(e) => setHashed(e.target.value.trim())} />
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
            <Field label="Client seed">
              <input className="field font-mono text-[0.75rem]" spellCheck={false} autoComplete="off" value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} />
            </Field>
            <Field label="Nonce">
              <input className="field tabular-nums" inputMode="numeric" value={nonce} onChange={(e) => setNonce(e.target.value)} />
            </Field>
          </div>
          {result && (
            <div className="space-y-2 pt-1 text-[0.75rem]">
              <div className="break-all text-ink-3">
                sha256(server seed) = <span className="text-ink-2">{result.check.computed}</span>
              </div>
              {result.check.matches === true && <Badge tone="good">matches hashed seed ✓</Badge>}
              {result.check.matches === false && <Badge tone="bad">does NOT match hashed seed</Badge>}
              <div>
                Drawn (in order): <TileChips tiles={result.drawn} highlight={selected} />
              </div>
              {tracked.length > 0 && (
                <div className="text-ink-2">
                  Tracked tiles hit: <b className="text-neon">{hits}</b> / {tracked.length}
                </div>
              )}
            </div>
          )}
        </div>
        <div>{result ? <Board drawn={drawnSet} selected={selected} label="Verified round result" /> : <p className="text-ink-3">Enter a revealed server seed to compute the round.</p>}</div>
      </div>
    </Panel>
  );
}

function ArchiveVerify() {
  const archive = useStore((s) => s.archive);
  const pf = useStore((s) => s.pf);
  const verify = useStore((s) => s.verify);
  const busy = useStore((s) => s.task !== null);
  const ready = Boolean(archive?.count && pf);

  return (
    <Panel
      title="Combined mode — archive vs seeds"
      icon={<ShieldAlert size={14} />}
      actions={
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void runVerify()}>
          Verify archive window
        </button>
      }
    >
      {!ready ? (
        <p className="text-ink-3">
          Load a bet archive <i>and</i> generate rounds from the seed pair that was active for those bets. Each archived bet in the Archive window is re-derived from its nonce and
          compared with the recorded draw.
        </p>
      ) : !verify ? (
        <p className="text-ink-3">
          Archive nonces {fmtInt(archive!.nonceMin)}–{fmtInt(archive!.nonceMax)} · generated {fmtInt(pf!.nonceStart)}–{fmtInt(pf!.nonceEnd)}. Press verify.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Checked" value={fmtInt(verify.checked)} sub={`of ${fmtInt(verify.considered)} bets in window`} />
            <Stat label="Matched" value={fmtInt(verify.matched)} tone={verify.checked > 0 && verify.mismatched === 0 ? 'good' : 'neutral'} sub={verify.checked ? fmtPct(verify.matched / verify.checked) : '—'} />
            <Stat label="Mismatched" value={fmtInt(verify.mismatched)} tone={verify.mismatched > 0 ? 'bad' : 'good'} sub="different seed pair or tampering" />
            <Stat label="Skipped" value={fmtInt(verify.noNonce + verify.outsidePf)} sub={`${fmtInt(verify.noNonce)} no nonce · ${fmtInt(verify.outsidePf)} outside range`} />
          </div>
          {verify.checked > 0 && verify.matched === verify.checked && (
            <Note>
              All {fmtInt(verify.checked)} checked bets reproduce exactly from the seeds ({fmtInt(verify.orderMatched)} also in identical draw order).
            </Note>
          )}
          {verify.mismatched > 0 && (
            <Note tone="warn">
              Mismatches usually mean the bets belong to a different (rotated) seed pair. Narrow the Archive window to the bets played under this seed pair and verify again.
            </Note>
          )}
          {verify.mismatches.length > 0 && (
            <DataTable
              rows={verify.mismatches}
              rowKey={(m) => m.index}
              maxHeight={400}
              columns={[
                { key: 'i', label: 'Bet #', numeric: true, render: (m) => fmtInt(m.index + 1) },
                { key: 'n', label: 'Nonce', numeric: true, render: (m) => fmtInt(m.nonce) },
                { key: 'a', label: 'Archive draw', render: (m) => <TileChips tiles={[...m.archive].sort((x, y) => x - y)} /> },
                { key: 'g', label: 'Seed draw', render: (m) => <TileChips tiles={[...m.generated].sort((x, y) => x - y)} tone="cold" /> },
              ]}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

export default function VerifyTab() {
  return (
    <div className="space-y-4">
      <ArchiveVerify />
      <SingleRound />
      <Note>
        Algorithm: <code>HMAC_SHA256(key = serverSeed, message = `$&#123;clientSeed&#125;:$&#123;nonce&#125;:$&#123;round&#125;`)</code> for rounds 0 and 1 → 40 bytes → 10 floats (4 bytes
        each, base-256 fraction) → square = remaining[⌊float × (40 − i)⌋], removed after each pick. Tested against a transcription of Stake’s published reference code.
      </Note>
    </div>
  );
}
