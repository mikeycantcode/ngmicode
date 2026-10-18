import type { TaskqContext } from "../core/context";
import { DuplicateJobError, InvalidJobOptionsError, JobNotFoundError, TaskqError } from "../core/errors";
import { createJobRecord, normalizeJobOptions } from "../core/job";
import type { JobId, JobOptions, JobRecord, JobState, RateLimitOptions, StateCounts } from "../core/types";
import type { RepeatSpec } from "../scheduler/repeat";
import { topoSortFlow, type FlowNode } from "./dependencies";

export interface QueueOptions {
  /** Merged under every job's options. `dependsOn` is never inherited. */
  defaultJobOptions?: JobOptions;
  /** Max job starts per window, enforced by each worker. */
  rateLimit?: RateLimitOptions;
  /** Keep terminally failed jobs in the dead-letter queue for replay. */
  deadLetter?: boolean;
  /** How many times a job may stall before it is failed. Default 1. */
  maxStalledCount?: number;
}

export interface BulkJob<T = unknown> {
  name: string;
  data: T;
  opts?: JobOptions;
}

export class Queue {
  private paused = false;

  constructor(
    readonly name: string,
    private readonly ctx: TaskqContext,
    readonly options: QueueOptions = {},
  ) {}

  get maxStalledCount(): number {
    return this.options.maxStalledCount ?? 1;
  }

  async add<T>(name: string, data: T, rawOpts: JobOptions = {}): Promise<JobRecord<T>> {
    const { storage, clock, events, deps } = this.ctx;
    const opts = normalizeJobOptions(rawOpts, this.options.defaultJobOptions);

    if (opts.jobId !== undefined) {
      const existing = await storage.get(opts.jobId);
      if (existing) return existing as JobRecord<T>;
    }

    const pending: JobId[] = [];
    for (const pid of opts.dependsOn) {
      const parent = await storage.get(pid);
      if (!parent) throw new JobNotFoundError(pid);
      if (parent.state === "failed") throw new InvalidJobOptionsError(`parent ${pid} has already failed`);
      if (parent.state !== "completed") pending.push(pid);
    }

    const seq = storage.nextSeq();
    // NOTE: a custom jobId that looks numeric can collide with a future auto id (#88).
    const id = opts.jobId ?? String(seq);
    // TODO: `delay` is ignored for jobs that start out blocked.
    const state: JobState = pending.length ? "blocked" : opts.delay > 0 ? "delayed" : "waiting";
    const job = createJobRecord({ id, seq, queue: this.name, name, data, opts, state, now: clock.now() });

    try {
      await storage.insert(job);
    } catch (e) {
      // Lost a race with a concurrent add of the same jobId — return the winner.
      if (e instanceof DuplicateJobError) {
        const existing = await storage.get(id);
        if (existing) return existing as JobRecord<T>;
      }
      throw e;
    }
    events.emit("added", { queue: this.name, job });

    if (state === "blocked") {
      await deps.link(id, opts.dependsOn);
      events.emit("blocked", { queue: this.name, jobId: id, pending });
      // A parent may have completed while we were linking.
      await deps.tryUnblock(id);
    } else if (state === "delayed") {
      await storage.pushDelayed(id, job.processAt!);
      events.emit("delayed", { queue: this.name, jobId: id, runAt: job.processAt! });
    } else {
      await storage.pushWaiting(id);
      events.emit("waiting", { queue: this.name, jobId: id });
    }
    return ((await storage.get(id)) ?? job) as JobRecord<T>;
  }

  /** Adds jobs in order. Not atomic: a failure part-way leaves earlier jobs added. */
  async addBulk<T>(jobs: BulkJob<T>[]): Promise<JobRecord<T>[]> {
    const out: JobRecord<T>[] = [];
    for (const j of jobs) out.push(await this.add(j.name, j.data, j.opts));
    return out;
  }

  /**
   * Add a DAG of jobs. Returns a map of node key -> job id. Throws CycleError
   * (and adds nothing) if the nodes contain a cycle.
   */
  async addFlow<T>(nodes: FlowNode<T>[]): Promise<Record<string, JobId>> {
    const ordered = topoSortFlow(nodes);
    const ids: Record<string, JobId> = {};
    for (const n of ordered) {
      const dependsOn = (n.dependsOn ?? []).map((d) => ids[d] ?? d);
      const job = await this.add(n.name, n.data, { dependsOn });
      ids[n.key] = job.id;
    }
    return ids;
  }

  /** Register (or replace) a repeatable job. See scheduler/repeat.ts. */
  repeat<T>(name: string, data: T, spec: Omit<RepeatSpec, "queue" | "name" | "data">): void {
    this.ctx.repeats.upsert({ ...spec, queue: this.name, name, data });
  }

  removeRepeat(key: string): boolean {
    return this.ctx.repeats.remove(key);
  }

  async getJob(id: JobId): Promise<JobRecord | undefined> {
    const job = await this.ctx.storage.get(id);
    return job && job.queue === this.name ? job : undefined;
  }

  async getJobs(state: JobState): Promise<JobRecord[]> {
    return this.ctx.storage.listByState(this.name, state);
  }

  async getCounts(): Promise<StateCounts> {
    return this.ctx.storage.counts(this.name);
  }

  /** Remove a job that is not currently active. */
  async remove(id: JobId): Promise<boolean> {
    const { storage, events } = this.ctx;
    const job = await this.getJob(id);
    if (!job) return false;
    if (job.state === "active") throw new TaskqError(`job ${id} is active and cannot be removed`, "JOB_ACTIVE");
    await storage.removeWaiting(id);
    await storage.removeDelayed(id);
    await storage.remove(id);
    events.emit("removed", { queue: this.name, jobId: id, prevState: job.state });
    return true;
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.ctx.events.emit("paused", { queue: this.name });
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.ctx.events.emit("resumed", { queue: this.name });
  }

  isPaused(): boolean {
    return this.paused;
  }
}
