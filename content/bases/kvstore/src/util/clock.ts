// Time source. Everything time-dependent (TTLs, active expiry, timers) must go
// through a Clock so tests can drive time deterministically.

export interface TimerHandle {
  readonly id: number;
}

export interface Clock {
  /** Milliseconds. Only differences and comparisons matter. */
  now(): number;
  setTimer(delayMs: number, fn: () => void): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}

export class SystemClock implements Clock {
  private handles = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  now(): number {
    return Date.now();
  }

  setTimer(delayMs: number, fn: () => void): TimerHandle {
    const id = this.nextId++;
    const h = setTimeout(() => {
      this.handles.delete(id);
      fn();
    }, Math.max(0, delayMs));
    this.handles.set(id, h);
    return { id };
  }

  clearTimer(handle: TimerHandle): void {
    const h = this.handles.get(handle.id);
    if (h !== undefined) clearTimeout(h);
    this.handles.delete(handle.id);
  }
}

interface ManualTimer {
  id: number;
  at: number;
  fn: () => void;
}

/**
 * Deterministic clock for tests. Timers fire synchronously from advance(), in
 * (due time, creation order) order, with now() set to each timer's due time.
 */
export class ManualClock implements Clock {
  private t: number;
  private timers: ManualTimer[] = [];
  private nextId = 1;

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): void {
    if (ms < 0) throw new RangeError("ManualClock cannot go backwards");
    const target = this.t + ms;
    for (;;) {
      let next: ManualTimer | undefined;
      for (const timer of this.timers) {
        if (timer.at > target) continue;
        if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
      }
      if (!next) break;
      this.timers = this.timers.filter((x) => x !== next);
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = target;
  }

  setTimer(delayMs: number, fn: () => void): TimerHandle {
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + Math.max(0, delayMs), fn });
    return { id };
  }

  clearTimer(handle: TimerHandle): void {
    this.timers = this.timers.filter((x) => x.id !== handle.id);
  }

  pendingTimers(): number {
    return this.timers.length;
  }
}
