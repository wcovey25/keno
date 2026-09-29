import { createKenoGenerator } from '../src/core/provablyFair';
import { columnsFromBets, type NormalizedBet } from '../src/core/dataset';
import { multiplierFor, type Risk } from '../src/core/payouts';
import { mulberry32 } from '../src/core/mathx';

/** Build realistic bets from a provably fair stream with random picks. */
export function syntheticBets(n: number, seed = 1, risk: Risk = 'classic'): NormalizedBet[] {
  const gen = createKenoGenerator('server-' + seed, 'client-' + seed);
  const rnd = mulberry32(seed);
  const bets: NormalizedBet[] = [];
  for (let i = 0; i < n; i++) {
    const drawn = gen.draw(i);
    const picks = 1 + Math.floor(rnd() * 10);
    const pool = Array.from({ length: 40 }, (_, t) => t);
    const selected: number[] = [];
    for (let j = 0; j < picks; j++) selected.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const hits = selected.filter((s) => drawn.includes(s)).length;
    const mult = multiplierFor(risk, picks, hits);
    bets.push({
      key: 'k' + i, betId: 'b' + i, time: 1_700_000_000_000 + i * 1000, nonce: i, drawn, selected, risk,
      amount: 1, payout: mult, payoutMultiplier: mult, currency: 'usdt', sourceFile: 'synthetic',
    });
  }
  return bets;
}

export const syntheticColumns = (n: number, seed = 1) => columnsFromBets(syntheticBets(n, seed));
