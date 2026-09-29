import { createHmac, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hmacSha256, sha256, sha256Hex, toHex } from '../src/core/sha256';
import { checkServerSeedHash, createKenoGenerator } from '../src/core/provablyFair';

// ---- Reference: transcription of Stake's published implementation ----------
function* byteGenerator({ serverSeed, clientSeed, nonce, cursor }: { serverSeed: string; clientSeed: string; nonce: number; cursor: number }) {
  let currentRound = Math.floor(cursor / 32);
  let currentRoundCursor = cursor;
  currentRoundCursor -= currentRound * 32;
  while (true) {
    const hmac = createHmac('sha256', serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${currentRound}`);
    const buffer = hmac.digest();
    while (currentRoundCursor < 32) {
      yield Number(buffer[currentRoundCursor]);
      currentRoundCursor += 1;
    }
    currentRoundCursor = 0;
    currentRound += 1;
  }
}

function generateFloats({ serverSeed, clientSeed, nonce, cursor, count }: { serverSeed: string; clientSeed: string; nonce: number; cursor: number; count: number }) {
  const rng = byteGenerator({ serverSeed, clientSeed, nonce, cursor });
  const bytes: number[] = [];
  while (bytes.length < count * 4) bytes.push(rng.next().value as number);
  const chunks: number[][] = [];
  for (let i = 0; i < bytes.length; i += 4) chunks.push(bytes.slice(i, i + 4));
  return chunks.map((chunk) =>
    chunk.reduce((result, value, i) => {
      const divider = 256 ** (i + 1);
      const partialResult = value / divider;
      return result + partialResult;
    }, 0),
  );
}

function referenceKeno(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const floats = generateFloats({ serverSeed, clientSeed, nonce, cursor: 0, count: 10 });
  const squares = Array.from({ length: 40 }, (_, i) => i);
  return floats.map((float, index) => squares.splice(Math.floor(float * (40 - index)), 1)[0]);
}
// -----------------------------------------------------------------------------

describe('sha256 / hmac', () => {
  it('matches node:crypto for many message lengths', () => {
    for (let len = 0; len < 300; len++) {
      const data = randomBytes(len);
      expect(toHex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });

  it('matches known vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('HMAC matches node:crypto for short, block-sized and long keys', () => {
    for (const keyLen of [0, 1, 32, 63, 64, 65, 200]) {
      for (const msgLen of [0, 5, 55, 56, 64, 119, 120, 500]) {
        const key = randomBytes(keyLen);
        const msg = randomBytes(msgLen);
        expect(toHex(hmacSha256(key, msg))).toBe(createHmac('sha256', key).update(msg).digest('hex'));
      }
    }
  });
});

describe('Stake Keno provably fair', () => {
  it('matches the reference implementation across random seeds and nonces', () => {
    for (let s = 0; s < 40; s++) {
      const serverSeed = randomBytes(32).toString('hex');
      const clientSeed = s % 3 === 0 ? randomBytes(5).toString('base64') : `client-${s}-${'x'.repeat(s * 3)}`;
      const gen = createKenoGenerator(serverSeed, clientSeed);
      for (const nonce of [0, 1, 2, 9, 10, 99, 100, 12345, 999999, 2 ** 31 + 7]) {
        expect(gen.draw(nonce)).toEqual(referenceKeno(serverSeed, clientSeed, nonce));
      }
    }
  });

  it('produces 10 distinct squares in 0..39', () => {
    const gen = createKenoGenerator('a'.repeat(64), 'seed');
    for (let nonce = 0; nonce < 2000; nonce++) {
      const d = gen.draw(nonce);
      expect(d).toHaveLength(10);
      expect(new Set(d).size).toBe(10);
      for (const x of d) expect(x >= 0 && x < 40).toBe(true);
    }
  });

  it('draws squares uniformly (loose frequency check)', () => {
    const gen = createKenoGenerator(randomBytes(32).toString('hex'), 'uniformity');
    const counts = new Array(40).fill(0);
    const rounds = 20000;
    for (let nonce = 0; nonce < rounds; nonce++) for (const x of gen.draw(nonce)) counts[x]++;
    const expected = rounds / 4;
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThan(6 * Math.sqrt(expected * 0.75));
  });

  it('verifies a server seed against its SHA-256 hash', () => {
    const seed = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(seed).digest('hex');
    expect(checkServerSeedHash(seed, hash.toUpperCase()).matches).toBe(true);
    expect(checkServerSeedHash(seed, '00' + hash.slice(2)).matches).toBe(false);
    expect(checkServerSeedHash(seed, '').matches).toBe(null);
  });

  it('rejects invalid nonces', () => {
    const gen = createKenoGenerator('s', 'c');
    expect(() => gen.draw(-1)).toThrow();
    expect(() => gen.draw(1.5)).toThrow();
  });
});
