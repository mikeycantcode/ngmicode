/**
 * Time source used by the scheduler and executors. Production uses `systemClock`;
 * tests use ManualClock so task durations are virtual and runs are deterministic.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

interface Timer {
  at: number;
  seq: number;
  resolve: () => void;
}

/** Lets every already-queued promise continuation run. */
export async function flushMicrotasks(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

export class ManualClock implements Clock {
  private t: number;
  private seq = 0;
  private timers: Timer[] = [];

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.push({ at: this.t + Math.max(0, ms), seq: this.seq++, resolve });
    });
  }

  pendingTimers(): number {
    return this.timers.length;
  }

  /** Fires the single earliest timer (FIFO among equal deadlines). Returns false if none. */
  tick(): boolean {
    if (!this.timers.length) return false;
    let best = 0;
    for (let i = 1; i < this.timers.length; i++) {
      const a = this.timers[i],
        b = this.timers[best];
      if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) best = i;
    }
    const [timer] = this.timers.splice(best, 1);
    this.t = Math.max(this.t, timer.at);
    timer.resolve();
    return true;
  }

  /** Advances virtual time by `ms`, firing every timer that comes due on the way. */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      await flushMicrotasks();
      const due = this.timers.filter((t) => t.at <= target);
      if (!due.length) break;
      this.tick();
    }
    this.t = target;
    await flushMicrotasks();
  }

  /**
   * Drives virtual time until `p` settles and returns its result. Throws if `p` is
   * still pending while no timers are scheduled (it would never settle).
   */
  async run<T>(p: Promise<T>): Promise<T> {
    let settled = false;
    p.then(
      () => (settled = true),
      () => (settled = true),
    );
    for (;;) {
      await flushMicrotasks();
      if (settled) return p;
      if (!this.tick()) {
        await new Promise((r) => setTimeout(r, 0));
        if (settled) return p;
        if (!this.timers.length) throw new Error("ManualClock.run: promise pending with no timers scheduled (deadlock?)");
      }
    }
  }
}
