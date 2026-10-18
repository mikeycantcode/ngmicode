import { JobNotFoundError, TaskqError } from "../core/errors";
import type { JobId, JobRecord } from "../core/types";
import type { TaskqEmitter } from "../events/events";
import type { Storage } from "../storage/storage";
import type { Clock } from "../clock/clock";

export interface DeadLetterEntry {
  jobId: JobId;
  queue: string;
  name: string;
  reason: string;
  attemptsMade: number;
  deadAt: number;
}

/**
 * Holds jobs that exhausted their attempts on queues created with
 * `{ deadLetter: true }`. The job record itself stays in storage (state
 * `failed`); the DLQ is an index over those records plus a replay tool.
 */
export class DeadLetterQueue {
  private entries = new Map<JobId, DeadLetterEntry>();

  constructor(
    private readonly storage: Storage,
    private readonly events: TaskqEmitter,
    private readonly clock: Clock,
  ) {}

  add(job: JobRecord): DeadLetterEntry {
    const entry: DeadLetterEntry = {
      jobId: job.id,
      queue: job.queue,
      name: job.name,
      reason: job.failedReason ?? "unknown",
      attemptsMade: job.attemptsMade,
      deadAt: this.clock.now(),
    };
    this.entries.set(job.id, entry);
    this.events.emit("dead", { queue: job.queue, jobId: job.id, reason: entry.reason });
    return entry;
  }

  has(jobId: JobId): boolean {
    return this.entries.has(jobId);
  }

  list(queue?: string): DeadLetterEntry[] {
    const all = [...this.entries.values()];
    return queue ? all.filter((e) => e.queue === queue) : all;
  }

  size(queue?: string): number {
    return this.list(queue).length;
  }

  /** Put a dead job back in line with a fresh attempt budget. */
  async replay(jobId: JobId): Promise<JobRecord> {
    const entry = this.entries.get(jobId);
    if (!entry) throw new TaskqError(`job ${jobId} is not in the dead-letter queue`, "NOT_DEAD");
    const job = await this.storage.get(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    // FIXME: bypasses the state machine; fine as long as only failed jobs land here.
    const updated = await this.storage.update(jobId, {
      state: "waiting",
      attemptsMade: 0,
      failedReason: undefined,
      finishedAt: undefined,
    });
    await this.storage.pushWaiting(jobId);
    this.entries.delete(jobId);
    this.events.emit("waiting", { queue: updated.queue, jobId });
    return updated;
  }

  async replayAll(queue: string): Promise<number> {
    let n = 0;
    for (const e of this.list(queue)) {
      await this.replay(e.jobId);
      n++;
    }
    return n;
  }

  /** Forget entries (does not delete the job records). */
  purge(queue?: string): number {
    let n = 0;
    for (const [id, e] of this.entries) {
      if (!queue || e.queue === queue) {
        this.entries.delete(id);
        n++;
      }
    }
    return n;
  }
}
