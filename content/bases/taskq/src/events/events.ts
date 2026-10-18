import type { JobId, JobRecord, JobState } from "../core/types";
import { TypedEmitter } from "./emitter";

/**
 * Every lifecycle event taskq emits. All payloads carry `queue` so a single
 * bus can serve every queue; filter on it in listeners.
 */
export interface TaskqEvents {
  added: { queue: string; job: JobRecord };
  waiting: { queue: string; jobId: JobId };
  delayed: { queue: string; jobId: JobId; runAt: number };
  blocked: { queue: string; jobId: JobId; pending: JobId[] };
  unblocked: { queue: string; jobId: JobId };
  active: { queue: string; jobId: JobId; workerId: string; attempt: number };
  progress: { queue: string; jobId: JobId; progress: JobRecord["progress"] };
  completed: { queue: string; jobId: JobId; returnValue: unknown; durationMs: number; attempt: number };
  failed: { queue: string; jobId: JobId; error: Error; attemptsMade: number; willRetry: boolean };
  retrying: { queue: string; jobId: JobId; attempt: number; delayMs: number };
  dead: { queue: string; jobId: JobId; reason: string };
  stalled: { queue: string; jobId: JobId; stalledCount: number };
  removed: { queue: string; jobId: JobId; prevState: JobState };
  "lock:lost": { queue: string; jobId: JobId; workerId: string };
  drained: { queue: string; workerId: string };
  paused: { queue: string };
  resumed: { queue: string };
  error: { error: Error; context: string };
}

export type TaskqEventName = keyof TaskqEvents;

export type TaskqEmitter = TypedEmitter<TaskqEvents>;

export function createEmitter(onListenerError?: (event: string, err: unknown) => void): TaskqEmitter {
  return new TypedEmitter<TaskqEvents>(onListenerError);
}
