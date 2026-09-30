import { describe, expect, it } from 'vitest';
import { scanCombos, type ScanParams } from '../src/core/scanner';
import { analyzeSet } from '../src/core/stats';
import { choose } from '../src/core/payouts';
import { syntheticColumns } from './helpers';

const base: ScanParams = {
  k: 3, threshold: 2, pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], risk: 'classic',
  sort: 'overdue', depth: 5000, maxCombos: 1e6, minEvents: 0, seed: 1,
};

describe('scanCombos', () => {
  // 1037 draws: exercises the partial last word
  const c = syntheticColumns(1037, 21);
  const r = { start: 0, end: 1036 };

  for (const [k, threshold] of [[3, 1], [3, 2], [3, 3], [5, 3], [7, 2], [10, 4]] as const) {
    it(`matches the per-draw engine for k=${k}, threshold=${threshold}`, () => {
      const pool = k === 10 ? Array.from({ length: 12 }, (_, i) => i * 3) : base.pool;
      const res = scanCombos(c.drawn, { ...base, k, threshold, pool });
      expect(res.mode).toBe('exhaustive');
      expect(res.scanned).toBe(choose(pool.length, k));
      for (const combo of res.results.slice(0, 40)) {
        const s = analyzeSet(c, r, combo.tiles, threshold, 'classic');
        expect(combo.events).toBe(s.gaps.events);
        expect(combo.currentDrought).toBe(s.gaps.currentDrought);
        expect(combo.longestDrought).toBe(s.gaps.longestDrought);
        expect(combo.rtp).toBeCloseTo(s.sim.rtp, 10);
        if (!Number.isNaN(s.gaps.meanInterval)) expect(combo.meanInterval).toBeCloseTo(s.gaps.meanInterval, 10);
      }
    });
  }

  it('sorts by the requested metric and honours depth', () => {
    const res = scanCombos(c.drawn, { ...base, sort: 'drought', depth: 10 });
    expect(res.results).toHaveLength(10);
    for (let i = 1; i < 10; i++) expect(res.results[i - 1].currentDrought).toBeGreaterThanOrEqual(res.results[i].currentDrought);
  });

  it('samples distinct combinations reproducibly when the space exceeds the budget', () => {
    const p = { ...base, k: 6, pool: Array.from({ length: 40 }, (_, i) => i), maxCombos: 500, depth: 20 };
    const a = scanCombos(c.drawn, p);
    const b = scanCombos(c.drawn, p);
    expect(a.mode).toBe('sampled');
    expect(a.scanned).toBe(500);
    expect(a.results.map((x) => x.tiles.join())).toEqual(b.results.map((x) => x.tiles.join()));
  });

  it('includes zero-hit payouts for 1-pick low risk', () => {
    const res = scanCombos(c.drawn, { ...base, k: 1, threshold: 1, risk: 'low', pool: [5], depth: 1 });
    const s = analyzeSet(c, r, [5], 1, 'low');
    expect(res.results[0].rtp).toBeCloseTo(s.sim.rtp, 10);
  });

  it('validates parameters', () => {
    expect(() => scanCombos(c.drawn, { ...base, threshold: 4 })).toThrow();
    expect(() => scanCombos(c.drawn, { ...base, pool: [1, 2] })).toThrow();
  });
});

describe('value ranking (Top Picks)', () => {
  const c = syntheticColumns(2000, 33);
  const r = { start: 0, end: 1999 };

  it('best level matches analyzeLevels for every returned combo', async () => {
    const { analyzeLevels } = await import('../src/core/stats');
    for (const risk of ['classic', 'high'] as const) {
      const res = scanCombos(c.drawn, { ...base, k: 6, threshold: 3, pool: Array.from({ length: 14 }, (_, i) => i * 2), risk, sort: 'value', depth: 30 });
      expect(res.results.length).toBe(30);
      for (let i = 1; i < res.results.length; i++) expect(res.results[i - 1].best!.score).toBeGreaterThanOrEqual(res.results[i].best!.score);
      for (const combo of res.results) {
        const levels = analyzeLevels(c, r, combo.tiles, risk);
        const scored = levels.filter((l) => !Number.isNaN(l.score));
        const top = scored.reduce((a, b) => (b.score > a.score ? b : a));
        expect(combo.best!.m).toBe(top.m);
        expect(combo.best!.score).toBeCloseTo(top.score, 9);
        expect(combo.best!.events).toBe(top.events);
        expect(combo.best!.gap).toBe(top.currentDrought);
      }
    }
  });

  it('attaches best level lazily for other sorts', () => {
    const res = scanCombos(c.drawn, { ...base, sort: 'drought', depth: 5 });
    for (const r of res.results) expect(r.best).not.toBeNull();
  });

  it('only scores levels that return a profit', async () => {
    const { profitLevels } = await import('../src/core/scanner');
    expect(profitLevels('high', 5).map((l) => l.m)).toEqual([3, 4, 5]);
    expect(profitLevels('classic', 5).map((l) => l.m)).toEqual([2, 3, 4, 5]);
  });
});
