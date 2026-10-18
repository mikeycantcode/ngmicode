import { InvalidJobOptionsError } from "./errors";
import type { JobId, JobOptions, JobRecord, JobState, NormalizedJobOptions } from "./types";

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/**
 * Merge per-job options over queue defaults and validate. Throws
 * InvalidJobOptionsError with a human-readable message.
 */
export function normalizeJobOptions(opts: JobOptions = {}, defaults: JobOptions = {}): NormalizedJobOptions {
  const merged: JobOptions = { ...defaults, ...opts };
  const priority = merged.priority ?? 0;
  const delay = merged.delay ?? 0;
  const attempts = merged.attempts ?? 1;
  if (!Number.isInteger(priority)) throw new InvalidJobOptionsError("priority must be an integer");
  if (!isNonNegInt(delay)) throw new InvalidJobOptionsError("delay must be a non-negative integer");
  if (!Number.isInteger(attempts) || attempts < 1) throw new InvalidJobOptionsError("attempts must be an integer >= 1");
  if (merged.timeout !== undefined && !(merged.timeout > 0)) throw new InvalidJobOptionsError("timeout must be > 0");
  if (merged.jobId !== undefined && (typeof merged.jobId !== "string" || merged.jobId.length === 0)) {
    throw new InvalidJobOptionsError("jobId must be a non-empty string");
  }
  // dependsOn is never inherited from queue defaults
  const dependsOn = [...new Set(opts.dependsOn ?? [])];
  return {
    jobId: merged.jobId,
    priority,
    delay,
    attempts,
    backoff: merged.backoff,
    timeout: merged.timeout,
    dependsOn,
  };
}

export interface NewJobParams<T> {
  id: JobId;
  seq: number;
  queue: string;
  name: string;
  data: T;
  opts: NormalizedJobOptions;
  state: JobState;
  now: number;
}

export function createJobRecord<T>(p: NewJobParams<T>): JobRecord<T> {
  return {
    id: p.id,
    queue: p.queue,
    name: p.name,
    data: p.data,
    opts: p.opts,
    state: p.state,
    priority: p.opts.priority,
    seq: p.seq,
    attemptsMade: 0,
    stalledCount: 0,
    createdAt: p.now,
    processAt: p.state === "delayed" ? p.now + p.opts.delay : undefined,
    progress: 0,
    stacktrace: [],
    logs: [],
    parents: [...p.opts.dependsOn],
    dependents: [],
  };
}

/** Short description for log lines. */
export function describeJob(job: Pick<JobRecord, "id" | "queue" | "name">): string {
  return `${job.queue}/${job.name}#${job.id}`;
}
