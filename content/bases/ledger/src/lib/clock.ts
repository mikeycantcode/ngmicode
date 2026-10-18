export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

export interface ManualClock extends Clock {
  set(ms: number): void;
  advance(ms: number): number;
}

export const DEFAULT_EPOCH = Date.UTC(2024, 0, 1); // 2024-01-01T00:00:00Z

/** Test/dev clock. Production wires systemClock in app.ts. */
export function manualClock(start: number = DEFAULT_EPOCH): ManualClock {
  let t = start;
  return {
    now: () => t,
    set: (ms) => {
      t = ms;
    },
    advance: (ms) => {
      t += ms;
      return t;
    },
  };
}

export const systemClock: Clock = { now: () => Date.now() };

export interface IdGenerator {
  next(prefix: string): string;
}

/**
 * Deterministic, per-prefix sequential ids: acct_000001, je_000001, pay_000001.
 * Zero-padded so lexicographic order == creation order (repositories rely on
 * this for tie-breaking).
 */
export function sequentialIds(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix: string) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}_${String(n).padStart(6, "0")}`;
    },
  };
}
