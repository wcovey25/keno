/**
 * Synchronous SHA-256 / HMAC-SHA256.
 *
 * Web Crypto's `crypto.subtle` is async-only, which adds a microtask hop per
 * nonce and makes generating millions of Keno rounds noticeably slower. This
 * implementation precomputes the HMAC inner/outer key states once per server
 * seed, so each round costs only the compression of the (short) message.
 * Correctness is covered by tests that compare against `node:crypto`.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);

/** Process one 64-byte block of `data` starting at `off`, updating state `H` in place. */
function compress(H: Uint32Array, data: Uint8Array, off: number): void {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const w15 = W[i - 15];
    const w2 = W[i - 2];
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0;
    d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
  H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
}

/**
 * Finish a hash whose state `H` has already absorbed `prefixLen` bytes (a multiple
 * of 64), by absorbing `msg[0..len)` plus padding. `scratch` must be ≥ len + 72 bytes.
 */
function finish(H: Uint32Array, prefixLen: number, msg: Uint8Array, len: number, scratch: Uint8Array): void {
  let off = 0;
  while (len - off >= 64) {
    compress(H, msg, off);
    off += 64;
  }
  const rem = len - off;
  const padLen = rem < 56 ? 64 : 128;
  scratch.fill(0, 0, padLen);
  for (let i = 0; i < rem; i++) scratch[i] = msg[off + i];
  scratch[rem] = 0x80;
  const bitLen = (prefixLen + len) * 8;
  // Messages here are far below 2^32 bytes, but encode the full 64-bit length anyway.
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  scratch[padLen - 8] = hi >>> 24; scratch[padLen - 7] = hi >>> 16; scratch[padLen - 6] = hi >>> 8; scratch[padLen - 5] = hi;
  scratch[padLen - 4] = lo >>> 24; scratch[padLen - 3] = lo >>> 16; scratch[padLen - 2] = lo >>> 8; scratch[padLen - 1] = lo;
  compress(H, scratch, 0);
  if (padLen === 128) compress(H, scratch, 64);
}

function stateToBytes(H: Uint32Array, out: Uint8Array): void {
  for (let i = 0; i < 8; i++) {
    const v = H[i];
    out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v;
  }
}

const encoder = new TextEncoder();

export function sha256(data: Uint8Array): Uint8Array {
  const H = new Uint32Array(IV);
  const out = new Uint8Array(32);
  finish(H, 0, data, data.length, new Uint8Array(128));
  stateToBytes(H, out);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** SHA-256 of a UTF-8 string, hex encoded — Stake's "hashed server seed". */
export function sha256Hex(text: string): string {
  return toHex(sha256(encoder.encode(text)));
}

/**
 * HMAC-SHA256 with a fixed key. `digest(msg, len, out)` writes 32 bytes to `out`
 * without allocating, so it can run in tight loops.
 */
export class HmacSha256 {
  private readonly inner = new Uint32Array(8);
  private readonly outer = new Uint32Array(8);
  private readonly H = new Uint32Array(8);
  private readonly innerDigest = new Uint8Array(32);
  private scratch = new Uint8Array(256);

  constructor(key: Uint8Array | string) {
    let k = typeof key === 'string' ? encoder.encode(key) : key;
    if (k.length > 64) k = sha256(k);
    const block = new Uint8Array(64);
    block.set(k);
    const pad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) pad[i] = block[i] ^ 0x36;
    this.inner.set(IV);
    compress(this.inner, pad, 0);
    for (let i = 0; i < 64; i++) pad[i] = block[i] ^ 0x5c;
    this.outer.set(IV);
    compress(this.outer, pad, 0);
  }

  digest(msg: Uint8Array, len: number, out: Uint8Array): void {
    if (this.scratch.length < len + 128) this.scratch = new Uint8Array(len + 128);
    const H = this.H;
    H.set(this.inner);
    finish(H, 64, msg, len, this.scratch);
    stateToBytes(H, this.innerDigest);
    H.set(this.outer);
    finish(H, 64, this.innerDigest, 32, this.scratch);
    stateToBytes(H, out);
  }
}

export function hmacSha256(key: string | Uint8Array, message: string | Uint8Array): Uint8Array {
  const msg = typeof message === 'string' ? encoder.encode(message) : message;
  const out = new Uint8Array(32);
  new HmacSha256(key).digest(msg, msg.length, out);
  return out;
}
