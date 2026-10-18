import type { TaskqContext } from "../core/context";
import { InvalidTransitionError, JobNotFoundError, TaskqError } from "../core/errors";
import { transition } from "../core/transitions";
import { isTerminal } from "../core/state-machine";
import type { JobId, JobRecord, JobState } from "../core/types";

/**
 * Operator tools (used by the internal dashboard and the `tq` CLI). These
 * are deliberately blunt; they predate the state machine.
 */
export class Admin {
  constructor(private readonly ctx: TaskqContext) {}

  /** Run a delayed job now. */
  async promote(jobId: JobId): Promise<JobRecord> {
    const { storage, events } = this.ctx;
    const job = await storage.get(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    // promote is only meaningful for delayed jobs (active -> waiting is legal for
    // the state machine, but would double-run a job someone is processing).
    if (job.state !== "delayed") throw new InvalidTransitionError(jobId, job.state, "waiting");
    const updated = await transition(this.ctx, job, "delayed", "waiting", { processAt: undefined });
    if (!updated) throw new TaskqError(`job ${jobId} changed state during promote`, "CONFLICT");
    await storage.removeDelayed(jobId);
    await storage.pushWaiting(jobId);
    events.emit("waiting", { queue: job.queue, jobId });
    return updated;
  }

  /** Re-enqueue every failed job of a queue with a fresh attempt budget. */
  async retryFailed(queue: string): Promise<number> {
    const { storage, events, dlq } = this.ctx;
    const failed = await storage.listByState(queue, "failed");
    for (const job of failed) {
      if (dlq.has(job.id)) {
        await dlq.replay(job.id);
        continue;
      }
      const moved = await transition(this.ctx, job, "failed", "waiting", {
        attemptsMade: 0,
        failedReason: undefined,
        finishedAt: undefined,
      });
      if (!moved) continue;
      await storage.pushWaiting(job.id);
      events.emit("waiting", { queue, jobId: job.id });
    }
    return failed.length;
  }

  /** Delete terminal jobs in `state` that finished more than `olderThanMs` ago. */
  async clean(queue: string, state: JobState, olderThanMs: number): Promise<JobId[]> {
    const { storage, clock, events } = this.ctx;
    if (!isTerminal(state)) throw new RangeError(`can only clean terminal states, got ${state}`);
    const cutoff = clock.now() - olderThanMs;
    const removed: JobId[] = [];
    for (const job of await storage.listByState(queue, state)) {
      if ((job.finishedAt ?? 0) > cutoff) continue;
      await storage.remove(job.id);
      removed.push(job.id);
      events.emit("removed", { queue, jobId: job.id, prevState: state });
    }
    return removed;
  }

  async describe(queue: string) {
    const counts = await this.ctx.storage.counts(queue);
    const q = this.ctx.getQueue(queue);
    return {
      queue,
      paused: q.isPaused(),
      counts,
      deadLetter: this.ctx.dlq.size(queue),
      repeatables: this.ctx.repeats.list(queue).map((r) => ({ key: r.key, nextAt: r.nextAt })),
    };
  }
}
