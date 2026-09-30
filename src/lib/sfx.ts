/**
 * Light UI sound design, synthesized with Web Audio (no audio files).
 *
 * Every sound is a short, soft sine/triangle tone through a gentle low-pass and
 * a compressor, at low volume — present enough to confirm an action, quiet
 * enough to never get in the way. The AudioContext is created lazily on the
 * first user gesture (browsers block audio before that).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
const lastPlayed = new Map<string, number>();

// Pentatonic scale (A minor) so tile selections always sound consonant.
const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

export function setSfxEnabled(v: boolean): void {
  enabled = v;
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!enabled || typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(lp).connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master! };
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  to?: number;
  type?: OscillatorType;
  dur: number;
  gain: number;
  delay?: number;
}

function play(name: string, tones: Tone[], minGapMs = 35): void {
  const a = audio();
  if (!a) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < minGapMs) return;
  lastPlayed.set(name, now);
  const t0 = a.ctx.currentTime + 0.005;
  for (const t of tones) {
    const start = t0 + (t.delay ?? 0);
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(t.gain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(g).connect(a.out);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}

export const sfx = {
  /** Generic button press. */
  click: () => play('click', [{ freq: 1150, to: 880, dur: 0.045, gain: 0.03 }]),
  /** Segmented control / tab change. */
  tick: () => play('tick', [{ freq: 1500, type: 'triangle', dur: 0.03, gain: 0.02 }]),
  /** Tile added — pitch follows the square so sequences sound musical. */
  select: (tile: number) => play('select', [{ freq: SCALE[tile % SCALE.length], dur: 0.12, gain: 0.04 }], 20),
  deselect: () => play('deselect', [{ freq: 392, to: 330, dur: 0.09, gain: 0.03 }], 20),
  /** Data loaded, verification passed. */
  success: () =>
    play('success', [
      { freq: 659.25, dur: 0.14, gain: 0.035 },
      { freq: 987.77, dur: 0.22, gain: 0.03, delay: 0.09 },
    ], 250),
  /** A background computation finished. */
  complete: () => play('complete', [{ freq: 880, to: 1046.5, dur: 0.16, gain: 0.022 }], 400),
  error: () =>
    play('error', [
      { freq: 311, type: 'triangle', dur: 0.12, gain: 0.035 },
      { freq: 262, type: 'triangle', dur: 0.18, gain: 0.03, delay: 0.1 },
    ], 300),
  open: () => play('open', [{ freq: 620, to: 930, dur: 0.08, gain: 0.025 }], 80),
  close: () => play('close', [{ freq: 930, to: 620, dur: 0.07, gain: 0.02 }], 80),
  mode: () =>
    play('mode', [
      { freq: 523.25, dur: 0.09, gain: 0.03 },
      { freq: 783.99, dur: 0.14, gain: 0.028, delay: 0.06 },
    ], 150),
};

/**
 * One document-level listener gives every control consistent feedback, so
 * components don't each need to remember to play a sound. Opt out per element
 * with `data-sfx="off"`, or pick a sound with `data-sfx="mode"` etc.
 */
export function installSfxDelegation(): () => void {
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('button, [role="tab"], a[href]');
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    const kind = el.dataset.sfx;
    if (kind === 'off') return;
    if (kind && kind in sfx && kind !== 'select') {
      (sfx as unknown as Record<string, () => void>)[kind]();
      return;
    }
    const tile = el.dataset.tile;
    // Capture phase: aria-pressed still holds the state *before* this click.
    if (tile !== undefined) {
      if (el.getAttribute('aria-pressed') === 'true') sfx.deselect();
      else sfx.select(Number(tile));
      return;
    }
    if (el.getAttribute('role') === 'tab' || el.hasAttribute('aria-pressed')) sfx.tick();
    else sfx.click();
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
