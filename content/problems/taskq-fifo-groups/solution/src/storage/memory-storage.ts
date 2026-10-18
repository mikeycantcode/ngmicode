import { DuplicateJobError, JobNotFoundError, LockMismatchError } from "../core/errors";
import { JOB_STATES, type JobId, type JobRecord, type JobState, type StateCounts } from "../core/types";
import { BinaryHeap } from "../utils/heap";
import type { CasExpectation, Storage } from "./storage";

interface WaitingEntry {
  id: JobId;
  priority: number;
  seq: number;
}

interface DelayedEntry {
  id: JobId;
  runAt: number;
  seq: number;
}

/**
 * FIFO group bookkeeping. Only the group's current `owner` is ever in the
 * waiting heap; later jobs wait in `pending` (add order) until the owner
 * reaches a terminal state. The owner keeps the group while it is active or
 * waiting out a retry backoff.
 */
interface GroupState {
  owner?: JobId;
  pending: JobId[];
}

interface QueueIndex {
  waiting: BinaryHeap<WaitingEntry>;
  delayed: BinaryHeap<DelayedEntry>;
  byState: Map<JobState, Set<JobId>>;
}

const byPriority = (a: WaitingEntry, b: WaitingEntry) => a.priority - b.priority || a.seq - b.seq;
const byRunAt = (a: DelayedEntry, b: DelayedEntry) => a.runAt - b.runAt || a.seq - b.seq;

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

/**
 * In-memory Storage adapter. Heaps hold *entries*, not jobs; an entry is
 * stale if the job was removed or moved to another state since it was pushed,
 * and stale entries are skipped lazily on pop.
 */
export class MemoryStorage implements Storage {
  private jobs = new Map<JobId, JobRecord>();
  private queues = new Map<string, QueueIndex>();
  private seq = 0;
  private lockCounter = 0;
  private groups = new Map<string, GroupState>();

  nextSeq(): number {
    return ++this.seq;
  }

  async insert(job: JobRecord): Promise<void> {
    if (this.jobs.has(job.id)) throw new DuplicateJobError(job.id);
    const stored = copyJob(job);
    this.jobs.set(job.id, stored);
    this.stateSet(job.queue, job.state).add(job.id);
  }

  async get(id: JobId): Promise<JobRecord | undefined> {
    const job = this.jobs.get(id);
    return job ? copyJob(job) : undefined;
  }

  async update(id: JobId, patch: Partial<JobRecord>): Promise<JobRecord> {
    const job = this.require(id);
    this.apply(job, patch);
    return copyJob(job);
  }

  async compareAndSet(id: JobId, expect: CasExpectation, patch: Partial<JobRecord>): Promise<JobRecord | undefined> {
    const job = this.jobs.get(id);
    if (!job || job.state !== expect.state) return undefined;
    if (expect.lockToken !== undefined && job.lockToken !== expect.lockToken) return undefined;
    this.apply(job, patch);
    return copyJob(job);
  }

  async remove(id: JobId): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    this.stateSet(job.queue, job.state).delete(id);
    this.jobs.delete(id);
    this.releaseGroup(job);
    return true;
  }

  async pushWaiting(id: JobId): Promise<void> {
    const job = this.require(id);
    const group = this.groupOf(job);
    if (group) {
      if (group.owner === undefined) group.owner = id;
      if (group.owner !== id) {
        if (!group.pending.includes(id)) {
          group.pending.push(id);
          group.pending.sort((a, b) => this.jobs.get(a)!.seq - this.jobs.get(b)!.seq);
        }
        return;
      }
    }
    this.index(job.queue).waiting.push({ id, priority: job.priority, seq: job.seq });
  }

  async removeWaiting(id: JobId): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    return this.index(job.queue).waiting.remove((e) => e.id === id);
  }

  async pushDelayed(id: JobId, runAt: number): Promise<void> {
    const job = this.require(id);
    this.index(job.queue).delayed.push({ id, runAt, seq: job.seq });
  }

  async removeDelayed(id: JobId): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    return this.index(job.queue).delayed.remove((e) => e.id === id);
  }

  async popDueDelayed(queue: string, now: number): Promise<JobId[]> {
    const heap = this.index(queue).delayed;
    const out: JobId[] = [];
    for (;;) {
      const top = heap.peek();
      if (!top || top.runAt > now) break;
      heap.pop();
      const job = this.jobs.get(top.id);
      if (!job || job.state !== "delayed") continue; // stale entry
      out.push(top.id);
    }
    return out;
  }

  async nextDelayedAt(queue: string): Promise<number | undefined> {
    const heap = this.index(queue).delayed;
    for (;;) {
      const top = heap.peek();
      if (!top) return undefined;
      const job = this.jobs.get(top.id);
      if (job && job.state === "delayed") return top.runAt;
      heap.pop(); // drop stale entry
    }
  }

  async claim(queue: string, workerId: string, now: number, lockMs: number): Promise<JobRecord | undefined> {
    const heap = this.index(queue).waiting;
    for (;;) {
      const entry = heap.pop();
      if (!entry) return undefined;
      const job = this.jobs.get(entry.id);
      if (!job || job.state !== "waiting") continue; // stale
      this.apply(job, {
        state: "active",
        attemptsMade: job.attemptsMade + 1,
        startedAt: now,
        lockedBy: workerId,
        lockToken: `${workerId}:${++this.lockCounter}`,
        lockUntil: now + lockMs,
      });
      return copyJob(job);
    }
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
    this.apply(job, { ...patch, lockToken: undefined, lockedBy: undefined, lockUntil: undefined });
    return copyJob(job);
  }

  async listByState(queue: string, state: JobState): Promise<JobRecord[]> {
    const ids = this.stateSet(queue, state);
    const out: JobRecord[] = [];
    for (const id of ids) out.push(copyJob(this.jobs.get(id)!));
    return out.sort((a, b) => a.seq - b.seq);
  }

  async countByState(queue: string, state: JobState): Promise<number> {
    return this.stateSet(queue, state).size;
  }

  async counts(queue: string): Promise<StateCounts> {
    const out = {} as StateCounts;
    for (const s of JOB_STATES) out[s] = this.stateSet(queue, s).size;
    return out;
  }

  async queueNames(): Promise<string[]> {
    return [...this.queues.keys()];
  }

  // ---- internals ----

  private require(id: JobId): JobRecord {
    const job = this.jobs.get(id);
    if (!job) throw new JobNotFoundError(id);
    return job;
  }

  private apply(job: JobRecord, patch: Partial<JobRecord>): void {
    const changed = patch.state && patch.state !== job.state;
    if (changed) {
      this.stateSet(job.queue, job.state).delete(job.id);
      this.stateSet(job.queue, patch.state!).add(job.id);
    }
    Object.assign(job, patch);
    if (changed && (job.state === "completed" || job.state === "failed")) this.releaseGroup(job);
  }

  private groupOf(job: JobRecord): GroupState | undefined {
    const name = job.opts.group;
    if (name === undefined) return undefined;
    const key = `${job.queue}\u0000${name}`;
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = { pending: [] }));
    return g;
  }

  /** The group's owner finished for good: hand the group to the next pending job. */
  private releaseGroup(job: JobRecord): void {
    const group = this.groupOf(job);
    if (!group) return;
    group.pending = group.pending.filter((id) => id !== job.id);
    if (group.owner !== job.id) return;
    group.owner = undefined;
    while (group.pending.length) {
      const next = this.jobs.get(group.pending.shift()!);
      if (!next || next.state !== "waiting") continue;
      group.owner = next.id;
      this.index(next.queue).waiting.push({ id: next.id, priority: next.priority, seq: next.seq });
      return;
    }
  }

  private index(queue: string): QueueIndex {
    let idx = this.queues.get(queue);
    if (!idx) {
      idx = {
        waiting: new BinaryHeap(byPriority),
        delayed: new BinaryHeap(byRunAt),
        byState: new Map(JOB_STATES.map((s) => [s, new Set<JobId>()])),
      };
      this.queues.set(queue, idx);
    }
    return idx;
  }

  private stateSet(queue: string, state: JobState): Set<JobId> {
    return this.index(queue).byState.get(state)!;
  }
}
