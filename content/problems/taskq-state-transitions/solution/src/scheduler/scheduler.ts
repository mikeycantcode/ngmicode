import type { TimerHandle } from "../clock/clock";
import type { TaskqContext } from "../core/context";
import { LockMismatchError, toError } from "../core/errors";
import { transition } from "../core/transitions";
import type { JobRecord } from "../core/types";

export interface SchedulerOptions {
  /** How often to look for stalled active jobs while any are active. Default 30s. */
  stalledInterval?: number;
}

/**
 * Background housekeeping, one per TaskQ:
 *  - promotes due `delayed` jobs to `waiting`
 *  - enqueues repeatable-job occurrences
 *  - recovers `active` jobs whose lock expired (stalled workers)
 *
 * It keeps a single clock timer armed at the earliest thing it has to do.
 * `tick()` is public so tests and admin tools can force a pass; ticks are
 * serialized, never overlapping.
 */
export class Scheduler {
  readonly stalledInterval: number;
  private running = false;
  private timer?: TimerHandle;
  private timerAt?: number;
  private chain: Promise<void> = Promise.resolve();
  private offs: (() => void)[] = [];

  constructor(
    private readonly ctx: TaskqContext,
    opts: SchedulerOptions = {},
  ) {
    this.stalledInterval = opts.stalledInterval ?? 30_000;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const { events, clock, repeats } = this.ctx;
    this.offs.push(
      events.on("delayed", (p) => this.armAt(p.runAt)),
      events.on("active", () => this.armAt(clock.now() + this.stalledInterval)),
    );
    repeats.onChange = () => {
      const at = repeats.nextAt();
      if (at !== undefined) this.armAt(at);
    };
    void this.tick();
  }

  stop(): void {
    this.running = false;
    for (const off of this.offs) off();
    this.offs = [];
    this.ctx.repeats.onChange = undefined;
    this.ctx.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.timerAt = undefined;
  }

  tick(): Promise<void> {
    const run = this.chain.then(() => this.runTick());
    this.chain = run.catch((err) => {
      this.ctx.events.emit("error", { error: toError(err), context: "scheduler tick" });
    });
    return run;
  }

  /** Move due delayed jobs of `queue` to waiting. Returns how many moved. */
  async promoteDue(queue: string, now: number): Promise<number> {
    const { storage, events } = this.ctx;
    const ids = await storage.popDueDelayed(queue, now);
    let n = 0;
    for (const id of ids) {
      const moved = await transition(this.ctx, { id, queue }, "delayed", "waiting", { processAt: undefined });
      if (!moved) continue;
      await storage.pushWaiting(id);
      events.emit("waiting", { queue, jobId: id });
      n++;
    }
    return n;
  }

  /** Recover active jobs whose lock has expired. Returns how many were recovered or failed. */
  async checkStalled(queue: string, now: number): Promise<number> {
    const { storage, events, dlq, deps, logger } = this.ctx;
    const maxStalled = this.ctx.getQueue(queue).maxStalledCount;
    const active = await storage.listByState(queue, "active");
    let n = 0;
    for (const job of active) {
      if (job.lockUntil === undefined || job.lockUntil >= now) continue;
      const stalledCount = job.stalledCount + 1;
      // finish() fences on the lock token we observed: if the owner finished meanwhile, skip.
      const fenced = async (to: "failed" | "waiting", patch: Partial<JobRecord>) => {
        try {
          return await transition(this.ctx, job, "active", to, patch, job.lockToken!);
        } catch (e) {
          if (e instanceof LockMismatchError) return undefined;
          throw e;
        }
      };
      if (stalledCount > maxStalled) {
        const reason = "job stalled more than allowable limit";
        const failed = await fenced("failed", { stalledCount, failedReason: reason, finishedAt: now });
        if (!failed) continue;
        logger.warn("job failed after stalling", { jobId: job.id, stalledCount });
        events.emit("failed", { queue, jobId: job.id, error: new Error(reason), attemptsMade: failed.attemptsMade, willRetry: false });
        if (this.ctx.getQueue(queue).options.deadLetter) dlq.add(failed);
        await deps.onFailed(failed);
      } else {
        const back = await fenced("waiting", { stalledCount });
        if (!back) continue;
        await storage.pushWaiting(job.id);
        events.emit("stalled", { queue, jobId: job.id, stalledCount });
        events.emit("waiting", { queue, jobId: job.id });
      }
      n++;
    }
    return n;
  }

  /** Enqueue due repeatable occurrences. */
  async enqueueRepeats(now: number): Promise<number> {
    const due = this.ctx.repeats.takeDue(now);
    for (const o of due) {
      await this.ctx.getQueue(o.spec.queue).add(o.spec.name, o.spec.data, { ...o.spec.opts, jobId: o.jobId });
    }
    return due.length;
  }

  private async runTick(): Promise<void> {
    const now = this.ctx.clock.now();
    for (const q of this.ctx.queueNames()) {
      await this.promoteDue(q, now);
      await this.checkStalled(q, now);
    }
    await this.enqueueRepeats(now);
    if (this.running) await this.rearm();
  }

  private async rearm(): Promise<void> {
    const { storage, repeats, clock } = this.ctx;
    const candidates: number[] = [];
    let anyActive = false;
    for (const q of this.ctx.queueNames()) {
      const at = await storage.nextDelayedAt(q);
      if (at !== undefined) candidates.push(at);
      if ((await storage.countByState(q, "active")) > 0) anyActive = true;
    }
    const r = repeats.nextAt();
    if (r !== undefined) candidates.push(r);
    if (anyActive) candidates.push(clock.now() + this.stalledInterval);
    if (candidates.length) this.armAt(Math.min(...candidates));
  }

  private armAt(at: number): void {
    if (!this.running) return;
    if (this.timer && this.timerAt !== undefined && this.timerAt <= at) return;
    const { clock } = this.ctx;
    clock.clearTimeout(this.timer);
    this.timerAt = at;
    this.timer = clock.setTimeout(() => {
      this.timer = undefined;
      this.timerAt = undefined;
      void this.tick();
    }, Math.max(0, at - clock.now()));
  }
}
