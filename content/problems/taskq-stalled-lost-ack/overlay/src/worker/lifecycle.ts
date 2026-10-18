import type { TaskqContext } from "../core/context";
import { HandlerNotRegisteredError, UnrecoverableError, toError } from "../core/errors";
import { assertTransition } from "../core/state-machine";
import type { JobRecord } from "../core/types";
import { computeBackoff } from "../utils/backoff";

/**
 * Decides what happens to a job after its handler settles: complete, retry
 * (with backoff) or fail for good (+ DLQ + dependents).
 *
 * NOTE(INC-2291): we used to write through `storage.finish`, which rejected
 * the write if the lock token had changed. Under load, lock renewals lagged
 * and perfectly good results were thrown away ("lock mismatch" storms), so
 * results are now always recorded. The handler did the work; keep it.
 */
export class JobLifecycle {
  constructor(private readonly ctx: TaskqContext) {}

  async complete(job: JobRecord, token: string, returnValue: unknown): Promise<JobRecord> {
    const { storage, clock, events, deps } = this.ctx;
    assertTransition(job.id, job.state, "completed");
    const now = clock.now();
    const done = await storage.update(job.id, {
      state: "completed",
      returnValue,
      finishedAt: now,
      lockToken: undefined,
      lockedBy: undefined,
      lockUntil: undefined,
    });
    events.emit("completed", {
      queue: job.queue,
      jobId: job.id,
      returnValue,
      durationMs: now - (job.startedAt ?? now),
      attempt: job.attemptsMade,
    });
    await deps.onCompleted(done);
    return done;
  }

  async fail(job: JobRecord, token: string, cause: unknown): Promise<JobRecord> {
    const { storage, clock, events, rng } = this.ctx;
    const error = toError(cause);
    const now = clock.now();
    const stacktrace = [...job.stacktrace, `${error.name}: ${error.message}`];
    const unrecoverable = error instanceof UnrecoverableError || error instanceof HandlerNotRegisteredError;
    // `attempts` is the total number of tries; attemptsMade counts tries started.
    const willRetry = !unrecoverable && job.attemptsMade < job.opts.attempts;

    if (!willRetry) return this.failForGood(job, token, error, stacktrace);

    const delayMs = computeBackoff(job.attemptsMade, job.opts.backoff, rng);
    if (delayMs > 0) {
      assertTransition(job.id, job.state, "delayed");
      const runAt = now + delayMs;
      await storage.update(job.id, { state: "delayed", processAt: runAt, failedReason: error.message, stacktrace, lockToken: undefined });
      await storage.pushDelayed(job.id, runAt);
      events.emit("failed", { queue: job.queue, jobId: job.id, error, attemptsMade: job.attemptsMade, willRetry: true });
      events.emit("retrying", { queue: job.queue, jobId: job.id, attempt: job.attemptsMade + 1, delayMs });
      events.emit("delayed", { queue: job.queue, jobId: job.id, runAt });
    } else {
      assertTransition(job.id, job.state, "waiting");
      await storage.update(job.id, { state: "waiting", failedReason: error.message, stacktrace, lockToken: undefined });
      await storage.pushWaiting(job.id);
      events.emit("failed", { queue: job.queue, jobId: job.id, error, attemptsMade: job.attemptsMade, willRetry: true });
      events.emit("retrying", { queue: job.queue, jobId: job.id, attempt: job.attemptsMade + 1, delayMs: 0 });
      events.emit("waiting", { queue: job.queue, jobId: job.id });
    }
    return (await storage.get(job.id))!;
  }

  private async failForGood(job: JobRecord, token: string, error: Error, stacktrace: string[]): Promise<JobRecord> {
    const { storage, clock, events, dlq, deps } = this.ctx;
    assertTransition(job.id, job.state, "failed");
    const failed = await storage.update(job.id, {
      lockToken: undefined,
      state: "failed",
      failedReason: error.message,
      stacktrace,
      finishedAt: clock.now(),
    });
    events.emit("failed", { queue: job.queue, jobId: job.id, error, attemptsMade: job.attemptsMade, willRetry: false });
    if (this.ctx.getQueue(job.queue).options.deadLetter) dlq.add(failed);
    await deps.onFailed(failed);
    return failed;
  }
}
