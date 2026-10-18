import { flushMicrotasks } from "../utils/async";
import type { Clock, TimerHandle } from "./clock";

interface PendingTimer {
  id: number;
  at: number;
  seq: number;
  fn: () => void;
}

/**
 * Deterministic clock for tests. Time only moves when you call `advance()`
 * (fires due timers in (dueTime, creation order) order, flushing microtasks
 * between each) or `jump()` (moves time without firing anything — simulates a
 * frozen process / GC pause).
 */
export class FakeClock implements Clock {
  private current: number;
  private timers = new Map<number, PendingTimer>();
  private nextId = 1;
  private seq = 0;

  constructor(start = 0) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    this.timers.set(id, { id, at: this.current + Math.max(0, ms), seq: this.seq++, fn });
    return { id };
  }

  clearTimeout(handle: TimerHandle | undefined): void {
    if (handle) this.timers.delete(handle.id);
  }

  pendingTimers(): number {
    return this.timers.size;
  }

  nextTimerAt(): number | undefined {
    let min: number | undefined;
    for (const t of this.timers.values()) if (min === undefined || t.at < min) min = t.at;
    return min;
  }

  /** Move time forward without firing timers. */
  jump(ms: number): void {
    this.current += ms;
  }

  /** Move time forward by `ms`, firing every timer that comes due along the way. */
  async advance(ms: number): Promise<void> {
    const target = this.current + Math.max(0, ms);
    const errors: unknown[] = [];
    await flushMicrotasks();
    for (;;) {
      const next = this.earliestDue(target);
      if (!next) break;
      this.timers.delete(next.id);
      if (next.at > this.current) this.current = next.at;
      try {
        next.fn();
      } catch (e) {
        errors.push(e);
      }
      await flushMicrotasks();
    }
    if (target > this.current) this.current = target;
    await flushMicrotasks();
    if (errors.length) throw errors[0];
  }

  /** Fire timers until none are left (or `maxTimers` fired). Returns how many fired. */
  async runAll(maxTimers = 10_000): Promise<number> {
    let fired = 0;
    while (this.timers.size && fired < maxTimers) {
      const at = this.nextTimerAt()!;
      await this.advance(Math.max(0, at - this.current));
      fired++;
    }
    return fired;
  }

  private earliestDue(limit: number): PendingTimer | undefined {
    let best: PendingTimer | undefined;
    for (const t of this.timers.values()) {
      if (t.at > limit) continue;
      if (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq)) best = t;
    }
    return best;
  }
}
