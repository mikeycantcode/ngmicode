import { stableStringify } from "./stable-json";

/**
 * Small deterministic, non-cryptographic hash (two FNV-1a 32-bit lanes with
 * different offset bases => 64 bits, rendered as 16 hex chars).
 *
 * This is NOT collision resistant against adversaries; it only needs to be stable
 * across runs/platforms for cache keys. We avoid `crypto` so the core runs anywhere.
 */
const PRIME = 0x01000193;
const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x050c5d1f;

export class Hasher {
  private a = OFFSET_A;
  private b = OFFSET_B;

  update(input: string): this {
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      this.a = Math.imul(this.a ^ (c & 0xff), PRIME);
      this.a = Math.imul(this.a ^ (c >>> 8), PRIME);
      this.b = Math.imul(this.b ^ (c >>> 8), PRIME);
      this.b = Math.imul(this.b ^ (c & 0xff), PRIME);
    }
    // field separator so update("ab").update("c") != update("a").update("bc")
    this.a = Math.imul(this.a ^ 0x1f, PRIME);
    this.b = Math.imul(this.b ^ 0x1f, PRIME);
    return this;
  }

  digest(): string {
    return hex(this.a) + hex(this.b);
  }
}

function hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

export function hashString(input: string): string {
  return new Hasher().update(input).digest();
}

export function hashObject(value: unknown): string {
  return hashString(stableStringify(value));
}

/** @deprecated use hashString — kept for cache entries written by buildgraph < 0.4 */
export function legacyHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return hex(h);
}
