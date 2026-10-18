/**
 * Time source. Every service takes a Clock instead of calling Date.now()
 * directly so that tests (and the replay tool) are deterministic.
 * All timestamps in the system are epoch milliseconds.
 */
export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class FakeClock implements Clock {
  private t: number;

  constructor(start = Date.UTC(2024, 0, 1, 12, 0, 0)) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): number {
    if (ms < 0) throw new RangeError("FakeClock cannot go backwards");
    this.t += ms;
    return this.t;
  }

  advanceSeconds(s: number): number {
    return this.advance(s * 1000);
  }

  advanceMinutes(m: number): number {
    return this.advance(m * 60_000);
  }

  set(t: number): void {
    this.t = t;
  }
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
