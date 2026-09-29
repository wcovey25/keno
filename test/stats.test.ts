import { describe, expect, it } from 'vitest';
import { analyzeArchiveRtp, analyzeSet, analyzeTiles, GapTracker } from '../src/core/stats';
import { chiSquarePValue } from '../src/core/mathx';
import { syntheticColumns } from './helpers';

describe('GapTracker', () => {
  it('computes droughts and intervals', () => {
    // hits at 2, 3, 7 in a window of 10: droughts 2 (lead), 0, 3, 2 (trail)
    const g = new GapTracker();
    [2, 3, 7].forEach((i) => g.hit(i));
    const s = g.summary(10, 0.25);
    expect(s.events).toBe(3);
    expect(s.currentDrought).toBe(2);
    expect(s.longestDrought).toBe(3);
    expect(s.meanInterval).toBe(2.5);
    expect(s.expectedInterval).toBe(4);
  });

  it('handles no events', () => {
    const s = new GapTracker().summary(7, 0.25);
    expect(s.currentDrought).toBe(7);
    expect(s.longestDrought).toBe(7);
    expect(Number.isNaN(s.meanInterval)).toBe(true);
  });
});

describe('chi-square p-values', () => {
  it('matches known quantiles', () => {
    expect(chiSquarePValue(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(54.572, 39)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(18.307, 10)).toBeCloseTo(0.05, 3);
  });
});

describe('analyzeTiles', () => {
  const c = syntheticColumns(4000, 7);
  const r = { start: 100, end: 3999 };
  const a = analyzeTiles(c, r, 200);

  it('counts match brute force', () => {
    const counts = new Array(40).fill(0);
    for (let i = r.start; i <= r.end; i++) for (let j = 0; j < 10; j++) counts[c.drawn[i * 10 + j]]++;
    expect(a.tiles.map((t) => t.count)).toEqual(counts);
    expect(a.n).toBe(3900);
    expect(a.tiles.reduce((s, t) => s + t.count, 0)).toBe(39000);
  });

  it('current drought matches brute force', () => {
    for (const t of a.tiles) {
      let d = 0;
      for (let i = r.end; i >= r.start; i--) {
        let seen = false;
        for (let j = 0; j < 10; j++) if (c.drawn[i * 10 + j] === t.tile) seen = true;
        if (seen) break;
        d++;
      }
      expect(t.currentDrought).toBe(d);
    }
  });

  it('fair data looks fair', () => {
    expect(a.chi2P).toBeGreaterThan(0.001);
    expect(a.meanSum).toBeGreaterThan(195);
    expect(a.meanSum).toBeLessThan(215);
    expect(a.meanRepeats).toBeGreaterThan(2.3);
    expect(a.meanRepeats).toBeLessThan(2.7);
  });

  it('χ² correction is calibrated: mean statistic ≈ df on fair data', () => {
    let total = 0;
    const reps = 30;
    for (let s = 0; s < reps; s++) total += analyzeTiles(syntheticColumns(400, 100 + s), { start: 0, end: 399 }, 50).chi2;
    expect(total / reps).toBeGreaterThan(39 * 0.8);
    expect(total / reps).toBeLessThan(39 * 1.2);
  });
});

describe('analyzeSet', () => {
  const c = syntheticColumns(3000, 3);
  const r = { start: 0, end: 2999 };
  it('histogram matches brute force and RTP is consistent', () => {
    const tiles = [0, 7, 13, 22, 39];
    const s = analyzeSet(c, r, tiles, 3, 'classic');
    const hist = new Array(6).fill(0);
    for (let i = 0; i <= 2999; i++) {
      let m = 0;
      for (let j = 0; j < 10; j++) if (tiles.includes(c.drawn[i * 10 + j])) m++;
      hist[m]++;
    }
    expect(s.histogram).toEqual(hist);
    expect(s.gaps.events).toBe(hist[3] + hist[4] + hist[5]);
    const row = [0, 0.25, 1.4, 4.1, 16.5, 36];
    expect(s.sim.rtp).toBeCloseTo(hist.reduce((a, h, i) => a + h * row[i], 0) / 3000, 10);
    expect(s.sim.netUnits).toBeCloseTo((s.sim.rtp - 1) * 3000, 6);
  });
});

describe('analyzeArchiveRtp', () => {
  it('recomputes RTP from real bets and finds no mismatches on consistent data', () => {
    const c = syntheticColumns(5000, 11);
    const res = analyzeArchiveRtp(c, { start: 0, end: 4999 }, 10);
    expect(res.scored).toBe(5000);
    expect(res.mismatchCount).toBe(0);
    expect(res.rtp).toBeGreaterThan(0.6);
    expect(res.rtp).toBeLessThan(1.5);
    expect(res.groups.reduce((s, g) => s + g.bets, 0)).toBe(5000);
    expect(res.currencies[0]).toMatchObject({ currency: 'usdt', bets: 5000 });
  });

  it('flags reported multipliers that disagree with the payout table', () => {
    const c = syntheticColumns(50, 12);
    c.payoutMult[5] = 123;
    const res = analyzeArchiveRtp(c, { start: 0, end: 49 }, 10);
    expect(res.mismatchCount).toBe(1);
    expect(res.mismatches[0].index).toBe(5);
  });

  it('derives missing multipliers from the table', () => {
    const c = syntheticColumns(20, 13);
    c.payoutMult.fill(NaN);
    c.payout.fill(NaN);
    const res = analyzeArchiveRtp(c, { start: 0, end: 19 }, 10);
    expect(res.derivedMultipliers).toBe(20);
    expect(res.scored).toBe(20);
  });
});
