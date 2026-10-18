export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface ManualClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

/** Controllable clock for tests and the dev seed. */
export function manualClock(start = Date.UTC(2025, 0, 15, 12, 0, 0)): ManualClock {
  let t = start;
  return {
    now: () => t,
    set: (ms) => {
      t = ms;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
