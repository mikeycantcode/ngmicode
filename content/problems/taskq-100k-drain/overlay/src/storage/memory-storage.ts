import { DuplicateJobError, JobNotFoundError, LockMismatchError } from "../core/errors";
import { JOB_STATES, type JobId, type JobRecord, type JobState, type StateCounts } from "../core/types";
import type { CasExpectation, Storage } from "./storage";

/** Shallow copy with fresh arrays so callers can't mutate stored state. `data` is shared (treat as immutable). */
function copyJob(job: JobRecord): JobRecord {
  return {
    ...job,
    stacktrace: [...job.stacktrace],
    logs: [...job.logs],
    parents: [...job.parents],
    dependents: [...job.dependents],
  };
}

const before = (a: JobRecord, b: JobRecord) => a.priority - b.priority || a.seq - b.seq;

/**
 * In-memory Storage adapter.
 *
 * Simplified in v2.3: the job map is the single source of truth and every
 * query is derived from it, so there are no secondary indexes that can drift
 * out of sync (see INC-1182 — stale heap entries). Queues are small in
 * practice, so a scan is cheap.
 */
export class MemoryStorage implements Storage {
  private jobs = new Map<JobId, JobRecord>();
  private delayedAt = new Map<JobId, number>();
  private seq = 0;
  private lockCounter = 0;

  nextSeq(): number {
    return ++this.seq;
  }

  async insert(job: JobRecord): Promise<void> {
    if (this.jobs.has(job.id)) throw new DuplicateJobError(job.id);
    this.jobs.set(job.id, copyJob(job));
  }

  async get(id: JobId): Promise<JobRecord | undefined> {
    const job = this.jobs.get(id);
    return job ? copyJob(job) : undefined;
  }

  async update(id: JobId, patch: Partial<JobRecord>): Promise<JobRecord> {
    const job = this.require(id);
    Object.assign(job, patch);
    return copyJob(job);
  }

  async compareAndSet(id: JobId, expect: CasExpectation, patch: Partial<JobRecord>): Promise<JobRecord | undefined> {
    const job = this.jobs.get(id);
    if (!job || job.state !== expect.state) return undefined;
    if (expect.lockToken !== undefined && job.lockToken !== expect.lockToken) return undefined;
    Object.assign(job, patch);
    return copyJob(job);
  }

  async remove(id: JobId): Promise<boolean> {
    this.delayedAt.delete(id);
    return this.jobs.delete(id);
  }

  // Waiting order is derived from (priority, seq) at claim time; nothing to index.
  async pushWaiting(id: JobId): Promise<void> {
    this.require(id);
  }

  async removeWaiting(id: JobId): Promise<boolean> {
    return this.jobs.get(id)?.state === "waiting";
  }

  async pushDelayed(id: JobId, runAt: number): Promise<void> {
    this.require(id);
    this.delayedAt.set(id, runAt);
  }

  async removeDelayed(id: JobId): Promise<boolean> {
    return this.delayedAt.delete(id);
  }

  async popDueDelayed(queue: string, now: number): Promise<JobId[]> {
    const due: JobRecord[] = [];
    for (const [id, runAt] of this.delayedAt) {
      const job = this.jobs.get(id);
      if (!job || job.state !== "delayed") {
        this.delayedAt.delete(id);
        continue;
      }
      if (job.queue === queue && runAt <= now) due.push(job);
    }
    due.sort((a, b) => this.delayedAt.get(a.id)! - this.delayedAt.get(b.id)! || a.seq - b.seq);
    for (const j of due) this.delayedAt.delete(j.id);
    return due.map((j) => j.id);
  }

  async nextDelayedAt(queue: string): Promise<number | undefined> {
    let min: number | undefined;
    for (const [id, runAt] of this.delayedAt) {
      const job = this.jobs.get(id);
      if (!job || job.state !== "delayed" || job.queue !== queue) continue;
      if (min === undefined || runAt < min) min = runAt;
    }
    return min;
  }

  async claim(queue: string, workerId: string, now: number, lockMs: number): Promise<JobRecord | undefined> {
    const candidates = (await this.listByState(queue, "waiting")).sort(before);
    const next = candidates[0];
    if (!next) return undefined;
    const job = this.jobs.get(next.id)!;
    Object.assign(job, {
      state: "active",
      attemptsMade: job.attemptsMade + 1,
      startedAt: now,
      lockedBy: workerId,
      lockToken: `${workerId}:${++this.lockCounter}`,
      lockUntil: now + lockMs,
    });
    return copyJob(job);
  }

  async extendLock(id: JobId, token: string, until: number): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job || job.state !== "active" || job.lockToken !== token) return false;
    job.lockUntil = until;
    return true;
  }

  async finish(id: JobId, token: string, patch: Partial<JobRecord>): Promise<JobRecord> {
    const job = this.jobs.get(id);
    if (!job || job.state !== "active" || job.lockToken !== token) throw new LockMismatchError(id);
    Object.assign(job, { ...patch, lockToken: undefined, lockedBy: undefined, lockUntil: undefined });
    return copyJob(job);
  }

  async listByState(queue: string, state: JobState): Promise<JobRecord[]> {
    const out: JobRecord[] = [];
    for (const job of this.jobs.values()) {
      if (job.queue === queue && job.state === state) out.push(copyJob(job));
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  async countByState(queue: string, state: JobState): Promise<number> {
    return (await this.listByState(queue, state)).length;
  }

  async counts(queue: string): Promise<StateCounts> {
    const out = {} as StateCounts;
    for (const s of JOB_STATES) out[s] = 0;
    for (const job of this.jobs.values()) if (job.queue === queue) out[job.state]++;
    return out;
  }

  async queueNames(): Promise<string[]> {
    return [...new Set([...this.jobs.values()].map((j) => j.queue))];
  }

  private require(id: JobId): JobRecord {
    const job = this.jobs.get(id);
    if (!job) throw new JobNotFoundError(id);
    return job;
  }
}
