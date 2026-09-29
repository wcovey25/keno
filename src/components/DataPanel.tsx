import { useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, KeyRound, Trash2, Upload, X } from 'lucide-react';
import { useStore } from '../state/store';
import { clearArchive, clearPf, generatePf, ingestFiles, removeFile, setNumberBase } from '../state/actions';
import { Badge, Field, Panel, Seg } from './ui';
import { cx, fmtBytes, fmtInt } from '../lib/format';
import type { NumberBaseSetting } from '../core/parser';

export function UploadZone({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = useStore((s) => s.task !== null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void ingestFiles(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cx(
        'rounded-md border border-dashed text-center transition-colors',
        compact ? 'px-3 py-3' : 'px-4 py-6',
        over ? 'border-neon bg-neon/5 shadow-[inset_0_0_24px_-8px_var(--color-neon)]' : 'border-line-strong',
      )}
    >
      <Upload size={compact ? 18 : 24} className="mx-auto text-neon-dim" aria-hidden />
      <p className="mt-2 text-ink-2">
        Drop Stake bet archive <span className="text-ink">.json</span> files here
      </p>
      <button type="button" className="btn btn-primary mt-2" disabled={busy} onClick={() => input.current?.click()}>
        <FileJson size={14} aria-hidden /> Choose files
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.ndjson,.jsonl,application/json"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void ingestFiles(files);
        }}
      />
      <p className="mt-2 text-[11px] text-ink-3">Parsed locally in a Web Worker — nothing leaves your browser.</p>
    </div>
  );
}

function ArchiveSection() {
  const archive = useStore((s) => s.archive);
  const busy = useStore((s) => s.task !== null);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <UploadZone compact={Boolean(archive)} />
      {archive && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded border border-line py-1.5">
              <div className="text-base text-neon tabular-nums glow">{fmtInt(archive.count)}</div>
              <div className="text-ink-3">bets</div>
            </div>
            <div className="rounded border border-line py-1.5">
              <div className="text-base tabular-nums">{fmtInt(archive.duplicates)}</div>
              <div className="text-ink-3">dupes</div>
            </div>
            <div className="rounded border border-line py-1.5">
              <div className="text-base tabular-nums">{archive.files.length}</div>
              <div className="text-ink-3">files</div>
            </div>
          </div>
          <ul className="space-y-1.5">
            {archive.files.map((f) => (
              <li key={f.name} className="rounded border border-line px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {f.error ? (
                    <AlertTriangle size={14} className="shrink-0 text-bad" aria-label="Error" />
                  ) : f.rejected > 0 ? (
                    <AlertTriangle size={14} className="shrink-0 text-warn" aria-label="Some records rejected" />
                  ) : (
                    <CheckCircle2 size={14} className="shrink-0 text-neon-dim" aria-label="OK" />
                  )}
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-neon" title={f.name} onClick={() => setOpen(open === f.name ? null : f.name)}>
                    {f.name}
                  </button>
                  <button type="button" className="text-ink-3 hover:text-bad" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => void removeFile(f.name)}>
                    <X size={14} />
                  </button>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-ink-3">
                  <span>{fmtBytes(f.size)}</span>
                  <span className="text-neon-dim">{fmtInt(f.accepted)} ok</span>
                  {f.rejected > 0 && <span className="text-warn">{fmtInt(f.rejected)} rejected</span>}
                  {f.nonKeno > 0 && <span>{fmtInt(f.nonKeno)} non-keno</span>}
                </div>
                {f.error && <div className="mt-1 text-[11px] text-bad">{f.error}</div>}
                {open === f.name && f.issues.length > 0 && (
                  <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[11px] text-ink-3">
                    {f.issues.map((i, k) => (
                      <li key={k}>
                        #{i.record}: {i.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {archive.count > 0 && (
            <div className="space-y-1.5 text-[11px] text-ink-3">
              <div className="flex flex-wrap items-center gap-2">
                <span>Square numbering</span>
                <Seg<NumberBaseSetting>
                  label="Square numbering in the export"
                  value={archive.baseSetting}
                  onChange={(b) => void setNumberBase(b)}
                  options={[
                    { value: 'auto', label: 'Auto', title: 'Detect from the data' },
                    { value: 0, label: '0–39', title: "Stake API format" },
                    { value: 1, label: '1–40', title: 'Board labels' },
                  ]}
                />
              </div>
              <div>
                Detected: {archive.base === 0 ? '0–39' : '1–40'} {archive.baseConclusive ? '' : '(inconclusive, defaulted)'} · order by{' '}
                {archive.order}
              </div>
              {archive.baseConflicting && <div className="text-warn">Both 0 and 40 appear — files may mix numbering schemes.</div>}
              {archive.outOfRange > 0 && <div className="text-warn">{fmtInt(archive.outOfRange)} bets dropped: squares out of range for this numbering.</div>}
              {archive.order === 'file' && <div className="text-warn">No timestamps or nonces — bets kept in file order.</div>}
            </div>
          )}
          <button type="button" className="btn btn-danger w-full" disabled={busy} onClick={() => void clearArchive()}>
            <Trash2 size={14} aria-hidden /> Clear archive
          </button>
        </>
      )}
    </div>
  );
}

function PfSection() {
  const pf = useStore((s) => s.pf);
  const busy = useStore((s) => s.task !== null);
  const archive = useStore((s) => s.archive);
  const [serverSeed, setServerSeed] = useState('');
  const [hashed, setHashed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonceStart, setNonceStart] = useState('0');
  const [count, setCount] = useState('10000');

  const matchArchive = () => {
    if (archive?.nonceMin === null || archive?.nonceMax === null || !archive) return;
    setNonceStart(String(archive.nonceMin));
    setCount(String(archive.nonceMax - archive.nonceMin + 1));
  };

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void generatePf({
          serverSeed: serverSeed.trim(),
          hashedServerSeed: hashed.trim(),
          clientSeed: clientSeed.trim(),
          nonceStart: Number(nonceStart),
          count: Number(count),
        });
      }}
    >
      <Field label="Server seed (revealed / unhashed)">
        <input className="field font-mono text-[12px]" spellCheck={false} autoComplete="off" value={serverSeed} onChange={(e) => setServerSeed(e.target.value)} placeholder="64 hex chars" required />
      </Field>
      <Field label="Hashed server seed (optional check)">
        <input className="field font-mono text-[12px]" spellCheck={false} autoComplete="off" value={hashed} onChange={(e) => setHashed(e.target.value)} placeholder="sha256(server seed)" />
      </Field>
      <Field label="Client seed">
        <input className="field font-mono text-[12px]" spellCheck={false} autoComplete="off" value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start nonce">
          <input className="field tabular-nums" inputMode="numeric" value={nonceStart} onChange={(e) => setNonceStart(e.target.value)} />
        </Field>
        <Field label="Rounds">
          <input className="field tabular-nums" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
      </div>
      {archive?.nonceMin !== null && archive?.nonceMin !== undefined && (
        <button type="button" className="text-[11px] text-cyan hover:underline" onClick={matchArchive}>
          Use archive nonce span ({fmtInt(archive.nonceMin)}–{fmtInt(archive.nonceMax)})
        </button>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy}>
          <KeyRound size={14} aria-hidden /> Generate draws
        </button>
        {pf && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void clearPf()} aria-label="Clear generated rounds">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {pf && (
        <div className="space-y-1 rounded border border-line px-2 py-1.5 text-[11px] text-ink-3">
          <div>
            <b className="text-neon">{fmtInt(pf.count)}</b> rounds · nonce {fmtInt(pf.nonceStart)}–{fmtInt(pf.nonceEnd)}
          </div>
          <div className="truncate" title={pf.serverSeedHash}>
            sha256: {pf.serverSeedHash.slice(0, 16)}…
          </div>
          <div>
            {pf.hashCheck.matches === true && <Badge tone="good">hash verified ✓</Badge>}
            {pf.hashCheck.matches === false && <Badge tone="bad">hash MISMATCH</Badge>}
            {pf.hashCheck.matches === null && <Badge>no hash supplied</Badge>}
          </div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-ink-3">
        HMAC-SHA256(server seed, “client:nonce:round”) → floats → Fisher–Yates over 40 squares, exactly as Stake publishes. Seeds never leave this tab.
      </p>
    </form>
  );
}

export function DataPanel() {
  const [tab, setTab] = useState<'archive' | 'pf'>('archive');
  return (
    <Panel
      title="Data sources"
      actions={
        <Seg
          label="Data source editor"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'archive', label: 'Archive' },
            { value: 'pf', label: 'Seeds' },
          ]}
        />
      }
    >
      {tab === 'archive' ? <ArchiveSection /> : <PfSection />}
    </Panel>
  );
}
