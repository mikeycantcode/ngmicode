// Core domain types shared by every layer. Keep this file free of runtime
// imports so storage adapters can depend on it without pulling in the world.

export type JobId = string;

/**
 * Lifecycle states. See README "Job lifecycle" for the allowed transitions;
 * the canonical table lives in core/state-machine.ts.
 */
export type JobState = "waiting" | "delayed" | "blocked" | "active" | "completed" | "failed";

export const JOB_STATES: readonly JobState[] = ["waiting", "delayed", "blocked", "active", "completed", "failed"];

export interface BackoffOptions {
  type: "fixed" | "exponential";
  /** Base delay in ms. */
  delay: number;
  /** Upper bound in ms, applied before jitter. */
  maxDelay?: number;
  /** 0..1 — fraction of the delay that may be randomly shaved off. */
  jitter?: number;
}

export interface JobOptions {
  /** Custom id. Adding a job whose id already exists returns the existing job. */
  jobId?: string;
  /** Lower value runs first. Default 0. Ties run in insertion order. */
  priority?: number;
  /** Initial delay in ms before the job becomes `waiting`. */
  delay?: number;
  /** Total number of tries, including the first one. Default 1 (no retries). */
  attempts?: number;
  /** Backoff between tries. A number means fixed backoff of that many ms. */
  backoff?: number | BackoffOptions;
  /** Per-try timeout in ms. The handler's `ctx.signal` is cancelled on timeout. */
  timeout?: number;
  /** Ids of jobs that must complete before this one may run. */
  dependsOn?: JobId[];
  /** Retention after completion: true/0 = remove this job, N = keep the N most recent completed jobs of the queue. */
  removeOnComplete?: boolean | number;
  /** Retention after terminal failure (same semantics). Jobs in the DLQ are never removed. */
  removeOnFail?: boolean | number;
}

export interface NormalizedJobOptions {
  jobId?: string;
  priority: number;
  delay: number;
  attempts: number;
  backoff?: number | BackoffOptions;
  timeout?: number;
  dependsOn: JobId[];
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export interface JobRecord<T = unknown> {
  id: JobId;
  queue: string;
  name: string;
  data: T;
  opts: NormalizedJobOptions;
  state: JobState;
  priority: number;
  /** Monotonic insertion sequence; used for FIFO tie-breaks. */
  seq: number;
  /** Number of tries started so far (incremented when a worker claims the job). */
  attemptsMade: number;
  stalledCount: number;
  createdAt: number;
  /** When a delayed job becomes runnable. */
  processAt?: number;
  startedAt?: number;
  finishedAt?: number;
  progress: number | Record<string, unknown>;
  returnValue?: unknown;
  failedReason?: string;
  stacktrace: string[];
  logs: string[];
  lockToken?: string;
  lockedBy?: string;
  lockUntil?: number;
  /** Jobs this job depends on. */
  parents: JobId[];
  /** Jobs that depend on this job. */
  dependents: JobId[];
}

export type StateCounts = Record<JobState, number>;

export interface RateLimitOptions {
  /** Max number of job starts... */
  max: number;
  /** ...per this many ms (sliding window). */
  duration: number;
}
