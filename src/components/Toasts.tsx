import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useStore } from '../state/store';
import { cx } from '../lib/format';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-40 flex flex-col items-end gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'fade-in pointer-events-auto flex max-w-md items-start gap-2 rounded border bg-panel px-3 py-2 text-[12px] shadow-xl',
            t.kind === 'error' ? 'border-bad/60 text-bad' : t.kind === 'success' ? 'border-neon-dim text-neon' : 'border-line-strong text-ink',
          )}
        >
          {t.kind === 'error' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
          <span className="min-w-0 flex-1">{t.text}</span>
          <button type="button" aria-label="Dismiss" className="text-ink-3 hover:text-ink" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
