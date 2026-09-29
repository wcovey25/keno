#!/usr/bin/env node
/**
 * Generate sample Stake-style Keno bet archives for testing the app.
 *
 *   node scripts/make-sample.mjs [bets=3000] [outDir=samples]
 *
 * Draws are derived independently with node:crypto from a fixed seed pair
 * (printed below), so the app's "Verify" tab should report a 100% match.
 * Two overlapping files are written to exercise cross-file deduplication, plus
 * a few non-Keno and malformed records to exercise validation.
 */
import { createHmac, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const count = Number(process.argv[2] ?? 3000);
const outDir = process.argv[3] ?? 'samples';
const serverSeed = 'b0c4f1e2d3a4958677e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0';
const clientSeed = 'keno-scanner-demo';

const PAYOUTS = {
  classic: [[0, 3.96], [0, 1.9, 4.5], [0, 1, 3.1, 10.4], [0, 0.8, 1.8, 5, 22.5], [0, 0.25, 1.4, 4.1, 16.5, 36], [0, 0, 1, 3.68, 7, 16.5, 40], [0, 0, 0.47, 3, 4.5, 14, 31, 60], [0, 0, 0, 2.2, 4, 13, 22, 55, 70], [0, 0, 0, 1.55, 3, 8, 15, 44, 60, 85], [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100]],
  low: [[0.7, 1.85], [0, 2, 3.8], [0, 1.1, 1.38, 26], [0, 0, 2.2, 7.9, 90], [0, 0, 1.5, 4.2, 13, 300], [0, 0, 1.1, 2, 6.2, 100, 700], [0, 0, 1.1, 1.6, 3.5, 15, 225, 700], [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800], [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000], [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000]],
  medium: [[0.4, 2.75], [0, 1.8, 5.1], [0, 0, 2.8, 50], [0, 0, 1.7, 10, 100], [0, 0, 1.4, 4, 14, 390], [0, 0, 0, 3, 9, 180, 710], [0, 0, 0, 2, 7, 30, 400, 800], [0, 0, 0, 2, 4, 11, 67, 400, 900], [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000], [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000]],
  high: [[0, 3.96], [0, 0, 17.1], [0, 0, 0, 81.5], [0, 0, 0, 10, 259], [0, 0, 0, 4.5, 48, 450], [0, 0, 0, 0, 11, 350, 710], [0, 0, 0, 0, 7, 90, 400, 800], [0, 0, 0, 0, 5, 20, 270, 600, 900], [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000], [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000]],
};

function kenoDraw(nonce) {
  const bytes = [];
  for (let round = 0; bytes.length < 40; round++) {
    bytes.push(...createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round}`).digest());
  }
  const squares = Array.from({ length: 40 }, (_, i) => i);
  const out = [];
  for (let i = 0; i < 10; i++) {
    const [a, b, c, d] = bytes.slice(i * 4, i * 4 + 4);
    const float = a / 256 + b / 256 ** 2 + c / 256 ** 3 + d / 256 ** 4;
    out.push(squares.splice(Math.floor(float * (40 - i)), 1)[0]);
  }
  return out;
}

let s = 42;
const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const risks = ['classic', 'low', 'medium', 'high'];
let picks = [3, 7, 12, 19, 25, 33];
const bets = [];
const t0 = Date.UTC(2026, 5, 1, 12, 0, 0);
for (let nonce = 0; nonce < count; nonce++) {
  if (rand() < 0.05) {
    const k = 3 + Math.floor(rand() * 8);
    const pool = Array.from({ length: 40 }, (_, i) => i);
    picks = Array.from({ length: k }, () => pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  const risk = risks[Math.floor(nonce / 750) % 4];
  const drawn = kenoDraw(nonce);
  const hits = picks.filter((p) => drawn.includes(p)).length;
  const mult = PAYOUTS[risk][picks.length - 1][hits];
  const amount = 0.0001;
  bets.push({
    id: `c0ffee00-0000-4000-8000-${String(nonce).padStart(12, '0')}`,
    iid: `house:${9_000_000 + nonce}`,
    type: 'casino',
    bet: {
      __typename: 'CasinoBet',
      id: `c0ffee00-0000-4000-8000-${String(nonce).padStart(12, '0')}`,
      active: false,
      nonce,
      game: 'keno',
      amount,
      payout: +(amount * mult).toFixed(8),
      payoutMultiplier: mult,
      amountMultiplier: 1,
      currency: 'ltc',
      updatedAt: new Date(t0 + nonce * 4000).toUTCString(),
      state: { __typename: 'CasinoGameKeno', risk, drawnNumbers: drawn, selectedNumbers: [...picks] },
    },
  });
}

mkdirSync(outDir, { recursive: true });
const cut = Math.floor(count * 0.6);
const overlap = Math.floor(count * 0.1);
const a = bets.slice(0, cut);
const b = bets.slice(cut - overlap);
// Stake exports newest-first; the app re-sorts chronologically.
a.reverse();
b.reverse();
// Noise: a dice bet and a malformed keno record.
a.push({ id: 'dice-1', type: 'casino', bet: { id: 'dice-1', game: 'dice', amount: 1, payout: 0, payoutMultiplier: 0, state: { result: 12.3, target: 50 } } });
b.push({ id: 'broken-1', bet: { id: 'broken-1', game: 'keno', state: { risk: 'classic', drawnNumbers: [1, 2, 3], selectedNumbers: [4] } } });

writeFileSync(join(outDir, 'keno-archive-part1.json'), JSON.stringify(a));
writeFileSync(join(outDir, 'keno-archive-part2.json'), JSON.stringify({ data: { user: { houseBetList: b } } }));
console.log(`Wrote ${a.length} + ${b.length} records (${overlap} overlapping) to ${outDir}/`);
console.log(`server seed:        ${serverSeed}`);
console.log(`hashed server seed: ${createHash('sha256').update(serverSeed).digest('hex')}`);
console.log(`client seed:        ${clientSeed}`);
console.log(`nonces:             0 – ${count - 1}`);
