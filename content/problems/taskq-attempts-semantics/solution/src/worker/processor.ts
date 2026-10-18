import type { Clock } from "../clock/clock";
import { JobTimeoutError } from "../core/errors";
import type { JobRecord } from "../core/types";
import type { TaskqEmitter } from "../events/events";
import type { JobHandler } from "../queue/registry";
import type { Storage } from "../storage/storage";
import { CancelController, type CancelSignal } from "../utils/cancel";

/** What a handler receives. */
export interface JobContext<T = unknown> {
  job: Readonly<JobRecord<T>>;
  data: T;
  /** 1-based number of this try. */
  attempt: number;
  /** True when a failure now will not be retried. */
  isLastAttempt: boolean;
  /** Cancelled on timeout (and on shutdown/cancellation where supported). */
  signal: CancelSignal;
  updateProgress(progress: JobRecord["progress"]): Promise<void>;
  log(line: string): Promise<void>;
  /** Clock-aware sleep; rejects with the signal's reason if cancelled. */
  sleep(ms: number): Promise<void>;
}

export interface ProcessorDeps {
  clock: Clock;
  storage: Storage;
  events: TaskqEmitter;
}

export function createJobContext<T>(job: JobRecord<T>, deps: ProcessorDeps, signal: CancelSignal): JobContext<T> {
  const { clock, storage, events } = deps;
  return {
    job,
    data: job.data,
    attempt: job.attemptsMade,
    isLastAttempt: job.attemptsMade >= job.opts.attempts,
    signal,
    async updateProgress(progress) {
      await storage.update(job.id, { progress });
      events.emit("progress", { queue: job.queue, jobId: job.id, progress });
    },
    async log(line) {
      const current = await storage.get(job.id);
      if (current) await storage.update(job.id, { logs: [...current.logs, line] });
    },
    sleep(ms) {
      return new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const t = clock.setTimeout(() => {
          off();
          resolve();
        }, ms);
        const off = signal.onAbort((reason) => {
          clock.clearTimeout(t);
          reject(reason);
        });
      });
    },
  };
}

/**
 * Run a handler for one try, enforcing `opts.timeout`. On timeout the
 * returned promise rejects with JobTimeoutError and `controller` is cancelled;
 * whatever the handler eventually does is ignored.
 */
export function runHandler<T>(
  job: JobRecord<T>,
  handler: JobHandler<T>,
  deps: ProcessorDeps,
  controller: CancelController = new CancelController(),
): Promise<unknown> {
  const ctx = createJobContext(job, deps, controller.signal);
  const timeout = job.opts.timeout;
  const run = Promise.resolve().then(() => handler(ctx));
  if (!timeout) return run;
  return new Promise((resolve, reject) => {
    const timer = deps.clock.setTimeout(() => {
      const err = new JobTimeoutError(job.id, timeout);
      controller.cancel(err);
      reject(err);
    }, timeout);
    run.then(
      (v) => {
        deps.clock.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        deps.clock.clearTimeout(timer);
        reject(e);
      },
    );
  });
}
