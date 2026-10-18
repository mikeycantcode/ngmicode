import type { TimerHandle } from "../clock/clock";
import type { TaskqContext } from "../core/context";
import { HandlerNotRegisteredError, LockMismatchError, toError } from "../core/errors";
import { describeJob } from "../core/job";
import type { JobId, JobRecord } from "../core/types";
import { RateLimiter } from "../queue/rate-limiter";
import { CancelController } from "../utils/cancel";
import { JobLifecycle } from "./lifecycle";
import { startLockRenewal } from "./lock-renewer";
import { runHandler } from "./processor";

export interface WorkerOptions {
  /** Max jobs processed at once by this worker. Default 1. */
  concurrency?: number;
  /** Lock TTL in ms; renewed every lockDuration/2 while the handler runs. Default 30s. */
  lockDuration?: number;
  /** Stable id for logs/locks. Default `worker-<n>`. */
  id?: string;
}

interface ActiveJob {
  job: JobRecord;
  controller: CancelController;
}

let workerCounter = 0;

/**
 * Pulls jobs from one queue and runs their handlers. Event driven: it wakes
 * on `waiting`/`resumed` events for its queue, after each job finishes, and
 * when a rate-limit window opens. There is no polling loop.
 */
export class Worker {
  readonly id: string;
  readonly concurrency: number;
  readonly lockDuration: number;
  private running = false;
  /** Slots in use: jobs being claimed + jobs being processed. */
  private inFlight = 0;
  private active = new Map<JobId, ActiveJob>();
  private wakeTimer?: TimerHandle;
  private unsubscribe: (() => void)[] = [];
  private processedSinceDrain = 0;
  private readonly lifecycle: JobLifecycle;
  /** Each worker enforces the queue's rate limit on the jobs it starts. */
  private readonly limiter?: RateLimiter;

  constructor(
    readonly queueName: string,
    private readonly ctx: TaskqContext,
    opts: WorkerOptions = {},
  ) {
    this.id = opts.id ?? `worker-${++workerCounter}`;
    this.concurrency = opts.concurrency ?? 1;
    this.lockDuration = opts.lockDuration ?? 30_000;
    if (!Number.isInteger(this.concurrency) || this.concurrency < 1) throw new RangeError("concurrency must be an integer >= 1");
    this.lifecycle = new JobLifecycle(ctx);
    const rateLimit = ctx.getQueue(queueName).options.rateLimit;
    if (rateLimit) this.limiter = new RateLimiter(rateLimit);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get activeCount(): number {
    return this.active.size;
  }

  activeJobIds(): JobId[] {
    return [...this.active.keys()];
  }

  start(): this {
    if (this.running) return this;
    this.running = true;
    const { events } = this.ctx;
    const mine = (p: { queue: string }) => p.queue === this.queueName;
    this.unsubscribe.push(
      events.on("waiting", (p) => mine(p) && this.kick()),
      events.on("resumed", (p) => mine(p) && this.kick()),
    );
    this.kick();
    return this;
  }

  /**
   * Stop taking new jobs.
   * TODO(#142): this does not wait for in-flight jobs; they keep running and
   * finish in the background. Callers that need a clean shutdown currently
   * have to poll `activeCount`.
   */
  async close(): Promise<void> {
    this.running = false;
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.ctx.clock.clearTimeout(this.wakeTimer);
    this.wakeTimer = undefined;
  }

  /** Try to fill free slots. Never throws; errors are reported on the bus. */
  kick(): void {
    this.fill().catch((err) => this.ctx.events.emit("error", { error: toError(err), context: `worker ${this.id} fill` }));
  }

  private async fill(): Promise<void> {
    const { storage, clock } = this.ctx;
    const queue = this.ctx.getQueue(this.queueName);
    while (this.running && this.inFlight < this.concurrency) {
      if (queue.isPaused()) return;
      const limiter = this.limiter;
      if (limiter && !limiter.tryAcquire(clock.now())) {
        this.wakeIn(limiter.msUntilAvailable(clock.now()));
        return;
      }
      // Reserve the slot *before* awaiting so concurrent fill() calls can't overshoot.
      this.inFlight++;
      let job: JobRecord | undefined;
      try {
        job = await storage.claim(this.queueName, this.id, clock.now(), this.lockDuration);
      } catch (err) {
        this.inFlight--;
        limiter?.release();
        throw err;
      }
      if (!job) {
        this.inFlight--;
        limiter?.release();
        this.maybeDrained();
        return;
      }
      void this.process(job);
    }
  }

  private async process(job: JobRecord): Promise<void> {
    const { clock, storage, events, registry, logger } = this.ctx;
    const token = job.lockToken!;
    const controller = new CancelController();
    this.active.set(job.id, { job, controller });
    events.emit("active", { queue: job.queue, jobId: job.id, workerId: this.id, attempt: job.attemptsMade });

    const renewal = startLockRenewal(clock, storage, job.id, token, this.lockDuration, () => {
      logger.warn("lost lock while processing", { job: describeJob(job), worker: this.id });
      events.emit("lock:lost", { queue: job.queue, jobId: job.id, workerId: this.id });
    });

    let ok = false;
    let value: unknown;
    try {
      const handler = registry.resolve(job);
      if (!handler) throw new HandlerNotRegisteredError(job.queue, job.name);
      value = await runHandler(job, handler, this.ctx, controller);
      ok = true;
    } catch (err) {
      value = err;
    } finally {
      renewal.stop();
    }

    try {
      if (ok) await this.lifecycle.complete(job, token, value);
      else await this.lifecycle.fail(job, token, value);
    } catch (err) {
      if (err instanceof LockMismatchError) {
        // Someone else owns this job now (it stalled and was re-claimed). Our result is stale.
        logger.warn("discarding result of job we no longer own", { job: describeJob(job), worker: this.id });
        events.emit("lock:lost", { queue: job.queue, jobId: job.id, workerId: this.id });
      } else {
        events.emit("error", { error: toError(err), context: `worker ${this.id} finishing ${job.id}` });
      }
    } finally {
      this.active.delete(job.id);
      this.inFlight--;
      this.processedSinceDrain++;
      this.kick();
    }
  }

  private maybeDrained(): void {
    if (this.inFlight === 0 && this.processedSinceDrain > 0) {
      this.processedSinceDrain = 0;
      this.ctx.events.emit("drained", { queue: this.queueName, workerId: this.id });
    }
  }

  private wakeIn(ms: number): void {
    if (this.wakeTimer) return;
    this.wakeTimer = this.ctx.clock.setTimeout(() => {
      this.wakeTimer = undefined;
      this.kick();
    }, Math.max(1, ms));
  }
}
