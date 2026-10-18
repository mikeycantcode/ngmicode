// Small deterministic hashing primitives. The sandbox has no crypto module, so
// we roll our own. These are NOT cryptographically strong — they exist so the
// signing protocol (and its verification rules) behave like the real thing.

function mix32(h: number, c: number): number {
  h ^= c;
  h = Math.imul(h, 0x01000193); // FNV prime
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

const SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5];

/** 256-bit digest rendered as 64 lowercase hex chars. */
export function digestHex(input: string): string {
  let out = "";
  for (let s = 0; s < SEEDS.length; s++) {
    let h = SEEDS[s];
    for (let i = 0; i < input.length; i++) h = mix32(h, input.charCodeAt(i));
    h = mix32(h, input.length);
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

/** HMAC-shaped keyed hash: H(k ^ opad || H(k ^ ipad || msg)). */
export function hmacHex(secret: string, message: string): string {
  let ipad = "";
  let opad = "";
  for (let i = 0; i < 64; i++) {
    const k = i < secret.length ? secret.charCodeAt(i) : 0;
    ipad += String.fromCharCode(k ^ 0x36);
    opad += String.fromCharCode(k ^ 0x5c);
  }
  return digestHex(opad + digestHex(ipad + message));
}

/** Compares two strings without short-circuiting on the first mismatch. */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** @deprecated use digestHex — kept for the v0 bot tokens still in the wild. */
export function quickHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) h = mix32(h, input.charCodeAt(i));
  return h.toString(16);
}
