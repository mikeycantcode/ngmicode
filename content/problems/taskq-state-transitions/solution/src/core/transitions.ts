import type { TaskqEmitter } from "../events/events";
import type { Storage } from "../storage/storage";
import { assertTransition } from "./state-machine";
import type { JobRecord, JobState } from "./types";

export interface TransitionDeps {
  storage: Storage;
  events: TaskqEmitter;
}

/**
 * The single choke point for changing a job's state.
 *
 *  - validates `from -> to` against the state machine (InvalidTransitionError)
 *  - writes atomically: with `lockToken`, via `storage.finish` (throws
 *    LockMismatchError if we no longer own the job); otherwise as a CAS on
 *    `from` (returns undefined if the job is no longer in `from`)
 *  - emits exactly one `state:changed` on success
 */
export async function transition(
  deps: TransitionDeps,
  job: Pick<JobRecord, "id" | "queue">,
  from: JobState,
  to: JobState,
  patch: Partial<JobRecord> = {},
  lockToken?: string,
): Promise<JobRecord | undefined> {
  assertTransition(job.id, from, to);
  const updated =
    lockToken !== undefined
      ? await deps.storage.finish(job.id, lockToken, { ...patch, state: to })
      : await deps.storage.compareAndSet(job.id, { state: from }, { ...patch, state: to });
  if (updated) deps.events.emit("state:changed", { queue: job.queue, jobId: job.id, from, to });
  return updated;
}

/** For transitions performed atomically inside storage (claim). */
export function announceTransition(events: TaskqEmitter, job: Pick<JobRecord, "id" | "queue">, from: JobState, to: JobState): void {
  events.emit("state:changed", { queue: job.queue, jobId: job.id, from, to });
}
