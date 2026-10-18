import type { JobId, JobState } from "./types";

/** Base class for every error thrown by taskq. `code` is stable; messages are not. */
export class TaskqError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class JobNotFoundError extends TaskqError {
  constructor(readonly jobId: JobId) {
    super(`job ${jobId} not found`, "JOB_NOT_FOUND");
  }
}

export class DuplicateJobError extends TaskqError {
  constructor(readonly jobId: JobId) {
    super(`job ${jobId} already exists`, "DUPLICATE_JOB");
  }
}

export class HandlerNotRegisteredError extends TaskqError {
  constructor(readonly queue: string, readonly jobName: string) {
    super(`no handler registered for "${jobName}" on queue "${queue}"`, "HANDLER_NOT_REGISTERED");
  }
}

export class InvalidJobOptionsError extends TaskqError {
  constructor(message: string) {
    super(message, "INVALID_JOB_OPTIONS");
  }
}

export class InvalidTransitionError extends TaskqError {
  constructor(readonly jobId: JobId, readonly from: JobState, readonly to: JobState) {
    super(`job ${jobId}: invalid transition ${from} -> ${to}`, "INVALID_TRANSITION");
  }
}

/** The caller no longer owns the job's lock (it stalled and was re-claimed, or was removed). */
export class LockMismatchError extends TaskqError {
  constructor(readonly jobId: JobId) {
    super(`lock mismatch for job ${jobId}`, "LOCK_MISMATCH");
  }
}

export class CycleError extends TaskqError {
  constructor(readonly path: string[]) {
    super(`dependency cycle: ${path.join(" -> ")}`, "DEPENDENCY_CYCLE");
  }
}

export class JobTimeoutError extends TaskqError {
  constructor(readonly jobId: JobId, readonly timeoutMs: number) {
    super(`job ${jobId} timed out after ${timeoutMs}ms`, "JOB_TIMEOUT");
  }
}

/** Reason given to an active job's signal when the job is cancelled. */
export class JobCancelledError extends TaskqError {
  constructor(readonly jobId: JobId, readonly reason: string) {
    super(`job ${jobId} cancelled: ${reason}`, "JOB_CANCELLED");
  }
}

export class QueueClosedError extends TaskqError {
  constructor(readonly queue: string) {
    super(`queue "${queue}" is closed`, "QUEUE_CLOSED");
  }
}

export class CronParseError extends TaskqError {
  constructor(readonly expression: string, reason: string) {
    super(`invalid cron expression "${expression}": ${reason}`, "CRON_PARSE");
  }
}

/**
 * Throw this from a handler to fail the job immediately, skipping any
 * remaining attempts.
 */
export class UnrecoverableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrecoverableError";
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}
