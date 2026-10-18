import type { JobId, JobRecord, JobState, StateCounts } from "../core/types";

/** Expected current values for a compare-and-set. */
export interface CasExpectation {
  state: JobState;
  /** When given, the job's current lockToken must match too. */
  lockToken?: string;
}

/**
 * Persistence boundary. Everything is async so a Redis/SQL adapter can slot in;
 * the in-memory adapter resolves immediately but callers MUST NOT assume
 * nothing interleaves across an `await`.
 *
 * Records returned are copies: mutating them does not change stored state.
 */
export interface Storage {
  /** Monotonic sequence used for auto ids and FIFO ordering. Synchronous on purpose. */
  nextSeq(): number;

  insert(job: JobRecord): Promise<void>;
  get(id: JobId): Promise<JobRecord | undefined>;
  /** Unconditional patch. Prefer `compareAndSet` when racing with workers. */
  update(id: JobId, patch: Partial<JobRecord>): Promise<JobRecord>;
  /** Patch only if the job currently matches `expect`. Returns undefined when it does not. */
  compareAndSet(id: JobId, expect: CasExpectation, patch: Partial<JobRecord>): Promise<JobRecord | undefined>;
  remove(id: JobId): Promise<boolean>;

  /** Make a `waiting` job claimable (orders by priority, then seq). */
  pushWaiting(id: JobId): Promise<void>;
  removeWaiting(id: JobId): Promise<boolean>;
  /** Track a `delayed` job until `runAt`. */
  pushDelayed(id: JobId, runAt: number): Promise<void>;
  removeDelayed(id: JobId): Promise<boolean>;
  /** Pop ids of delayed jobs with runAt <= now (in runAt, seq order). Does not change their state. */
  popDueDelayed(queue: string, now: number): Promise<JobId[]>;
  nextDelayedAt(queue: string): Promise<number | undefined>;

  /**
   * Atomically take the highest-priority waiting job of `queue`, mark it
   * active, increment attemptsMade and give it a fresh lock.
   */
  claim(queue: string, workerId: string, now: number, lockMs: number): Promise<JobRecord | undefined>;
  extendLock(id: JobId, token: string, until: number): Promise<boolean>;
  /**
   * Leave the active state while still holding the lock. Throws
   * LockMismatchError if the job is not active or `token` is not the current lock.
   * Clears lock fields.
   */
  finish(id: JobId, token: string, patch: Partial<JobRecord>): Promise<JobRecord>;

  listByState(queue: string, state: JobState): Promise<JobRecord[]>;
  countByState(queue: string, state: JobState): Promise<number>;
  counts(queue: string): Promise<StateCounts>;
  queueNames(): Promise<string[]>;
}
