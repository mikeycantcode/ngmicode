// All time in the system flows through a Clock so tests (and the simulator)
// can control it. Times are epoch milliseconds. Never call Date.now() directly
// from domain/services code.

export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export class ManualClock implements Clock {
  private t: number;
  constructor(start = 1_700_000_000_000) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): number {
    this.t += ms;
    return this.t;
  }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

// Deterministic, lexicographically sortable ids: `<prefix>_<zero-padded seq>`.
// One sequence per prefix so ids read nicely in tests ("m_000003").

export class IdGenerator {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(6, "0")}`;
  }

  /** Random-looking but deterministic token (used for webhook secrets). */
  token(prefix: string, length = 24): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    const seq = this.next(`${prefix}tok`);
    let seed = 0;
    for (let i = 0; i < seq.length; i++) seed = (seed * 31 + seq.charCodeAt(i)) >>> 0;
    let out = "";
    for (let i = 0; i < length; i++) {
      // xorshift32
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      out += alphabet[seed % alphabet.length];
    }
    return `${prefix}_${out}`;
  }
}
