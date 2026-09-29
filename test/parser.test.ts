import { describe, expect, it } from 'vitest';
import { detectNumberBase, mergeParsed, parseArchiveText, parseTime } from '../src/core/parser';

const bet = (id: string, over: Record<string, unknown> = {}, state: Record<string, unknown> = {}) => ({
  id, iid: 'house:' + id, type: 'bet', game: 'keno', amount: 0.5, payout: 0, payoutMultiplier: 0,
  currency: 'BTC', updatedAt: '2026-01-01T00:00:0' + (Number(id) % 10) + 'Z', nonce: Number(id),
  state: { risk: 'classic', drawnNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], selectedNumbers: [10, 20, 30], ...state },
  ...over,
});

describe('parseArchiveText', () => {
  it('parses a bare array', () => {
    const { report, bets } = parseArchiveText('a.json', JSON.stringify([bet('1'), bet('2')]));
    expect(report.error).toBeNull();
    expect(report.accepted).toBe(2);
    expect(bets[0].currency).toBe('btc');
    expect(bets[0].time).toBe(Date.parse('2026-01-01T00:00:01Z'));
  });

  it('finds bets nested in GraphQL-style wrappers and { bet: {...} } layers', () => {
    const doc = { data: { user: { houseBetList: [{ id: 'h1', iid: 'x', bet: { ...bet('3'), id: 'inner3' } }] } } };
    const { report, bets } = parseArchiveText('b.json', JSON.stringify(doc));
    expect(report.accepted).toBe(1);
    expect(bets[0].nonce).toBe(3);
  });

  it('coerces numeric strings and comma separated lists', () => {
    const b = bet('4', { amount: '0.00010000', nonce: '4' }, { drawnNumbers: '0,1,2,3,4,5,6,7,8,9', selectedNumbers: ['10', '11'] });
    const { bets, report } = parseArchiveText('c.json', JSON.stringify([b]));
    expect(report.rejected).toBe(0);
    expect(bets[0].amount).toBeCloseTo(0.0001);
    expect(bets[0].selected).toEqual([10, 11]);
  });

  it('rejects invalid records individually with reasons', () => {
    const docs = [
      bet('5', {}, { drawnNumbers: [0, 1, 2] }),
      bet('6', {}, { drawnNumbers: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9] }),
      bet('7', {}, { selectedNumbers: [] }),
      bet('8', {}, { risk: 'extreme' }),
      bet('9', {}, { drawnNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 99] }),
      bet('10'),
    ];
    const { report } = parseArchiveText('d.json', JSON.stringify(docs));
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(5);
    expect(report.issues.map((i) => i.reason).join('|')).toMatch(/exactly 10/);
    expect(report.issues.map((i) => i.reason).join('|')).toMatch(/repeat/);
  });

  it('skips non-keno bets without counting them as errors', () => {
    const dice = { id: 'd1', game: 'dice', amount: 1, payout: 0, state: { result: 50, target: 49.5 } };
    const { report } = parseArchiveText('e.json', JSON.stringify([dice, bet('11')]));
    expect(report.nonKeno).toBe(1);
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(0);
  });

  it('reports invalid JSON and empty archives', () => {
    expect(parseArchiveText('f.json', '{nope').report.error).toMatch(/Invalid JSON/);
    expect(parseArchiveText('g.json', '{"a": 1}').report.error).toMatch(/No Keno bets/);
  });

  it('accepts NDJSON', () => {
    const text = [bet('12'), bet('13')].map((b) => JSON.stringify(b)).join('\n');
    expect(parseArchiveText('h.ndjson', text).report.accepted).toBe(2);
  });
});

describe('mergeParsed', () => {
  it('dedupes across files and sorts chronologically', () => {
    const f1 = parseArchiveText('1.json', JSON.stringify([bet('3'), bet('1')]));
    const f2 = parseArchiveText('2.json', JSON.stringify([bet('1'), bet('2')]));
    const m = mergeParsed([f1, f2]);
    expect(m.duplicates).toBe(1);
    expect(m.bets.map((b) => b.betId)).toEqual(['1', '2', '3']);
    expect(m.order).toBe('time');
  });

  it('dedupes id-less records by content fingerprint', () => {
    const b = bet('4');
    const noId = { ...b, id: undefined, iid: undefined };
    const f = parseArchiveText('x.json', JSON.stringify([noId, noId]));
    expect(mergeParsed([f]).duplicates).toBe(1);
  });

  it('detects 1-based exports and converts to 0-based', () => {
    const b = bet('5', {}, { drawnNumbers: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40], selectedNumbers: [40, 1] });
    const f = parseArchiveText('x.json', JSON.stringify([b]));
    const m = mergeParsed([f]);
    expect(m.base).toBe(1);
    expect(m.bets[0].drawn[9]).toBe(39);
    expect(m.bets[0].selected).toEqual([39, 0]);
  });

  it('flags conflicting bases and drops out-of-range records', () => {
    const a = bet('6', {}, { drawnNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    const b = bet('7', {}, { drawnNumbers: [40, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    const m = mergeParsed([parseArchiveText('x.json', JSON.stringify([a, b]))]);
    expect(detectNumberBase([...m.bets]).conflicting).toBe(false);
    expect(m.baseConflicting).toBe(true);
    expect(m.base).toBe(0);
    expect(m.outOfRange).toBe(1);
  });
});

describe('parseTime', () => {
  it('handles seconds, ms, ISO and RFC strings', () => {
    expect(parseTime(1700000000)).toBe(1700000000000);
    expect(parseTime(1700000000000)).toBe(1700000000000);
    expect(parseTime('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1));
    expect(parseTime('Thu, 01 Jan 2026 00:00:00 GMT')).toBe(Date.UTC(2026, 0, 1));
    expect(parseTime('garbage')).toBeNull();
  });
});
