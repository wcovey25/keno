import { describe, expect, it } from 'vitest';
import { PAYOUTS, RISKS, atLeastProbability, choose, hitDistribution, theoreticalRtp } from '../src/core/payouts';

describe('payout tables', () => {
  it('has a row for every picks count with picks+1 entries', () => {
    for (const risk of RISKS) {
      expect(PAYOUTS[risk]).toHaveLength(10);
      PAYOUTS[risk].forEach((row, i) => expect(row).toHaveLength(i + 2));
    }
  });

  it('every table returns ~99% (Stake 1% house edge, rounded multipliers)', () => {
    for (const risk of RISKS) {
      for (let k = 1; k <= 10; k++) {
        const rtp = theoreticalRtp(risk, k);
        expect(rtp, `${risk} ${k}`).toBeGreaterThan(0.985);
        expect(rtp, `${risk} ${k}`).toBeLessThan(0.992);
      }
    }
  });

  it('hypergeometric distribution sums to 1', () => {
    for (let k = 1; k <= 10; k++) {
      expect(hitDistribution(k).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(atLeastProbability(k, 0)).toBeCloseTo(1, 12);
    }
    expect(choose(40, 10)).toBe(847660528);
  });
});
