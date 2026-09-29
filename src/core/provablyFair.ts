/**
 * Stake Originals — Keno provably fair draw generation.
 *
 * Mirrors Stake's published implementation exactly:
 *
 *   byteGenerator: HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${round}`)
 *                  yields the 32 digest bytes of round 0, then round 1, ...
 *   generateFloats: every 4 bytes → b0/256 + b1/256² + b2/256³ + b3/256⁴  ∈ [0, 1)
 *   Keno:          10 floats (cursor 0 → 40 bytes → rounds 0 and 1). Float i picks
 *                  index ⌊float × (40 − i)⌋ from the remaining squares [0..39]
 *                  (a Fisher–Yates draw without replacement).
 *
 * Squares are returned 0-indexed (0..39), matching Stake's API; add 1 for the
 * board labels 1..40. All arithmetic is exact: each float has ≤ 32 significant
 * bits and multiplying by an integer ≤ 40 stays well inside double precision.
 */
import { HmacSha256, sha256Hex } from './sha256';

export const KENO_SQUARES = 40;
export const KENO_DRAWS = 10;

const encoder = new TextEncoder();

export interface KenoGenerator {
  /** Write the 10 drawn squares (0-indexed, in draw order) for `nonce` into out[offset..offset+10). */
  drawInto(nonce: number, out: Uint8Array, offset: number): void;
  draw(nonce: number): number[];
}

export function createKenoGenerator(serverSeed: string, clientSeed: string): KenoGenerator {
  const hmac = new HmacSha256(serverSeed);
  const prefix = encoder.encode(`${clientSeed}:`);
  // prefix + up to 16 nonce digits + ":" + round digits
  const msg = new Uint8Array(prefix.length + 32);
  msg.set(prefix);
  const bytes = new Uint8Array(64); // two rounds of digest
  const digest = new Uint8Array(32);
  const pool = new Uint8Array(KENO_SQUARES);

  function writeInt(value: number, at: number): number {
    const s = String(value);
    for (let i = 0; i < s.length; i++) msg[at + i] = s.charCodeAt(i);
    return at + s.length;
  }

  function drawInto(nonce: number, out: Uint8Array, offset: number): void {
    if (!Number.isSafeInteger(nonce) || nonce < 0) throw new RangeError(`Invalid nonce: ${nonce}`);
    let p = writeInt(nonce, prefix.length);
    msg[p++] = 0x3a; // ':'
    for (let round = 0; round < 2; round++) {
      const len = writeInt(round, p);
      hmac.digest(msg, len, digest);
      bytes.set(digest, round * 32);
    }
    for (let i = 0; i < KENO_SQUARES; i++) pool[i] = i;
    let remaining = KENO_SQUARES;
    for (let i = 0; i < KENO_DRAWS; i++) {
      const j = i * 4;
      const float =
        bytes[j] / 256 + bytes[j + 1] / 65536 + bytes[j + 2] / 16777216 + bytes[j + 3] / 4294967296;
      const idx = Math.floor(float * (KENO_SQUARES - i));
      out[offset + i] = pool[idx];
      // splice(idx, 1): shift the tail left, preserving order (as Array.prototype.splice does).
      for (let m = idx; m < remaining - 1; m++) pool[m] = pool[m + 1];
      remaining--;
    }
  }

  return {
    drawInto,
    draw(nonce: number): number[] {
      const out = new Uint8Array(KENO_DRAWS);
      drawInto(nonce, out, 0);
      return Array.from(out);
    },
  };
}

/** Stake shows the SHA-256 of the (unhashed) server seed before it is revealed. */
export function hashServerSeed(serverSeed: string): string {
  return sha256Hex(serverSeed);
}

export interface SeedCheck {
  provided: string | null;
  computed: string;
  matches: boolean | null;
}

export function checkServerSeedHash(serverSeed: string, hashed: string | null | undefined): SeedCheck {
  const computed = hashServerSeed(serverSeed);
  const provided = hashed?.trim().toLowerCase() || null;
  return { provided, computed, matches: provided === null ? null : provided === computed };
}
