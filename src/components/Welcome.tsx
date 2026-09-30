import { ShieldAlert, Sparkles } from 'lucide-react';
import { useStore } from '../state/store';
import { Modal } from './ui';

/** First-visit introduction + responsible-gambling notice (carried over from v43). */
export function Welcome() {
  const accepted = useStore((s) => s.welcomeAccepted);
  const set = useStore((s) => s.set);
  if (accepted) return null;
  const enter = (mode: 'standard' | 'advanced') => set({ welcomeAccepted: true, mode });
  return (
    <Modal title="Welcome to Keno Scanner" onClose={() => enter(useStore.getState().mode)}>
      <div className="space-y-4 text-[0.8125rem] leading-relaxed text-ink-2">
        <p>
          Load your Stake Keno bet history (or a revealed seed pair) and the scanner finds hot and cold numbers and the combinations that are most “due” — all
          computed <b className="text-ink">locally in your browser</b>. Nothing is uploaded.
        </p>
        <div className="rounded border border-warn/40 bg-warn/5 p-3 text-warn">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <ShieldAlert size={15} aria-hidden /> Just for fun — not a prediction
          </div>
          <p className="text-[0.75rem]">
            Every round is independent. A combination that hasn’t hit in 10,000 rounds has exactly the same chance on the next round as one that hit a minute ago.
            Believing otherwise is the gambler’s fallacy. Use this tool to explore your history and choose numbers you enjoy.
          </p>
        </div>
        <p className="text-[0.75rem] text-ink-3">
          For entertainment and education only; no guarantee of any outcome. You must be of legal gambling age where you live. Only play with money you can afford to
          lose. Need help? <span className="text-ink-2">ncpgambling.org · 1-800-522-4700</span>.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn btn-primary flex-1 py-2" data-sfx="mode" onClick={() => enter('standard')}>
            <Sparkles size={14} aria-hidden /> Start — Standard mode
          </button>
          <button type="button" className="btn flex-1 py-2" data-sfx="mode" onClick={() => enter('advanced')}>
            Advanced mode
          </button>
        </div>
        <p className="text-center text-[0.6875rem] text-ink-3">You can switch modes any time at the top of the page.</p>
      </div>
    </Modal>
  );
}
