export const fmtInt = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString();

export const fmtNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : !Number.isFinite(n) ? '∞' : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtPct = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(digits)}%`;

export const fmtSigned = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;

export const fmtMult = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}×`;

export function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return '—';
  if (p < 1e-4) return p.toExponential(1);
  return p.toFixed(4);
}

export function fmtDate(ms: number | null | undefined, withTime = true): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  const d = new Date(ms);
  return withTime
    ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KiB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MiB`;
  return `${(b / 1024 ** 3).toFixed(2)} GiB`;
}

/** Board label for a 0-indexed square. */
export const sq = (t: number) => t + 1;

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
