import { SystemClock, type Clock } from "../clock/clock";
import type { TaskqContext } from "../core/context";
import { TaskqError } from "../core/errors";
import { createEmitter, type TaskqEmitter } from "../events/events";
import { MetricsCollector } from "../metrics/metrics";
import { DeadLetterQueue } from "../queue/dead-letter";
import { DependencyTracker } from "../queue/dependencies";
import { Queue, type QueueOptions } from "../queue/queue";
import { HandlerRegistry, type JobHandler } from "../queue/registry";
import { RepeatRegistry } from "../scheduler/repeat";
import { Scheduler, type SchedulerOptions } from "../scheduler/scheduler";
import { MemoryStorage } from "../storage/memory-storage";
import type { Storage } from "../storage/storage";
import { noopLogger, type Logger } from "../utils/logger";
import { createRng } from "../utils/rng";
import { Worker, type WorkerOptions } from "../worker/worker";
import { Admin } from "./admin";

export interface TaskqOptions {
  clock?: Clock;
  storage?: Storage;
  logger?: Logger;
  /** Seed for backoff jitter. Default 1. */
  seed?: number;
  scheduler?: SchedulerOptions;
}

/**
 * Composition root. Owns the shared context and hands out queues and
 * workers. Typical use:
 *
 *   const tq = createTaskQ({ clock });
 *   const emails = tq.queue("emails", { deadLetter: true });
 *   tq.define("emails", "welcome", async (ctx) => send(ctx.data));
 *   tq.worker("emails", { concurrency: 4 }).start();
 *   tq.scheduler.start();
 */
export class TaskQ {
  readonly clock: Clock;
  readonly storage: Storage;
  readonly events: TaskqEmitter;
  readonly logger: Logger;
  readonly registry = new HandlerRegistry();
  readonly dlq: DeadLetterQueue;
  readonly deps: DependencyTracker;
  readonly repeats: RepeatRegistry;
  readonly metrics: MetricsCollector;
  readonly scheduler: Scheduler;
  readonly admin: Admin;
  private readonly ctx: TaskqContext;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(opts: TaskqOptions = {}) {
    this.clock = opts.clock ?? new SystemClock();
    this.storage = opts.storage ?? new MemoryStorage();
    this.logger = opts.logger ?? noopLogger;
    this.events = createEmitter((event, err) => this.logger.error(`listener for "${event}" threw`, { err: String(err) }));
    this.dlq = new DeadLetterQueue(this.storage, this.events, this.clock);
    this.deps = new DependencyTracker(this.storage, this.events, this.clock, this.logger);
    this.repeats = new RepeatRegistry(this.clock);
    this.metrics = new MetricsCollector(this.events);
    this.ctx = {
      clock: this.clock,
      storage: this.storage,
      events: this.events,
      logger: this.logger,
      rng: createRng(opts.seed ?? 1),
      registry: this.registry,
      dlq: this.dlq,
      deps: this.deps,
      repeats: this.repeats,
      getQueue: (name) => {
        const q = this.queues.get(name);
        if (!q) throw new TaskqError(`unknown queue "${name}"`, "UNKNOWN_QUEUE");
        return q;
      },
      queueNames: () => [...this.queues.keys()],
    };
    this.scheduler = new Scheduler(this.ctx, opts.scheduler);
    this.admin = new Admin(this.ctx);
  }

  /** Get or create a queue. Options are only applied on creation. */
  queue(name: string, opts?: QueueOptions): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, this.ctx, opts);
      this.queues.set(name, q);
    } else if (opts) {
      this.logger.warn("queue already exists; ignoring options", { queue: name });
    }
    return q;
  }

  define<T = any>(queue: string, jobName: string, handler: JobHandler<T>): this {
    this.registry.define(queue, jobName, handler);
    return this;
  }

  /** Create a worker (not started). The queue must exist. */
  worker(queue: string, opts?: WorkerOptions): Worker {
    this.ctx.getQueue(queue);
    const w = new Worker(queue, this.ctx, opts);
    this.workers.push(w);
    return w;
  }

  allWorkers(): readonly Worker[] {
    return this.workers;
  }

  /** Stop the scheduler and all workers. */
  async close(): Promise<void> {
    this.scheduler.stop();
    await Promise.all(this.workers.map((w) => w.close()));
  }
}

export function createTaskQ(opts?: TaskqOptions): TaskQ {
  return new TaskQ(opts);
}
