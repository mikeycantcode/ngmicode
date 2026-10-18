import { InvalidTransitionError } from "./errors";
import type { JobId, JobState } from "./types";

/**
 * Allowed job state transitions.
 *
 *   waiting  -> active                      (worker claims)
 *   delayed  -> waiting                     (scheduler promotes)
 *   blocked  -> waiting | failed            (parents completed / a parent failed)
 *   active   -> completed | failed          (handler outcome)
 *   active   -> delayed | waiting           (retry with / without backoff, stall recovery)
 *   failed   -> waiting                     (DLQ replay, admin retry)
 *   completed -> (terminal)
 */
const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  waiting: ["active"],
  delayed: ["waiting"],
  blocked: ["waiting", "failed"],
  active: ["completed", "failed", "delayed", "waiting"],
  failed: ["waiting"],
  completed: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(jobId: JobId, from: JobState, to: JobState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(jobId, from, to);
}

export function isTerminal(state: JobState): boolean {
  return state === "completed" || state === "failed";
}

// TODO(platform#311): the scheduler, DLQ and admin tools still write `state`
// directly through storage. Everything should go through assertTransition.
