import type { RateLimitOptions } from "../core/types";

/**
 * Sliding-window limiter: at most `max` acquisitions in any window of
 * `duration` ms. A start at time t stops counting at t + duration.
 *
 * One limiter per *queue* (owned by Queue) — every worker on that queue shares
 * it, otherwise N workers would get N times the budget.
 */
export class RateLimiter {
  readonly max: number;
  readonly duration: number;
  private starts: number[] = [];

  constructor(opts: RateLimitOptions) {
    if (!Number.isInteger(opts.max) || opts.max < 1) throw new RangeError("rateLimit.max must be an integer >= 1");
    if (!(opts.duration > 0)) throw new RangeError("rateLimit.duration must be > 0");
    this.max = opts.max;
    this.duration = opts.duration;
  }

  tryAcquire(now: number): boolean {
    this.prune(now);
    if (this.starts.length >= this.max) return false;
    this.starts.push(now);
    return true;
  }

  /** Undo the most recent acquire (e.g. the worker found nothing to claim). */
  release(): void {
    this.starts.pop();
  }

  /** ms until `tryAcquire` can succeed (0 if it can now). */
  msUntilAvailable(now: number): number {
    this.prune(now);
    if (this.starts.length < this.max) return 0;
    return this.starts[0] + this.duration - now;
  }

  inWindow(now: number): number {
    this.prune(now);
    return this.starts.length;
  }

  private prune(now: number): void {
    const cutoff = now - this.duration;
    while (this.starts.length && this.starts[0] <= cutoff) this.starts.shift();
  }
}
