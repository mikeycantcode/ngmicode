import { CycleError } from "../core/errors";
import { transition } from "../core/transitions";
import type { JobId, JobRecord } from "../core/types";
import type { TaskqEmitter } from "../events/events";
import type { Storage } from "../storage/storage";
import type { Clock } from "../clock/clock";
import type { Logger } from "../utils/logger";

/**
 * Job DAG bookkeeping. A job with unfinished parents sits in `blocked`; once
 * every parent is `completed` it moves to `waiting`. If any parent fails
 * terminally, its blocked descendants fail too (they can never run).
 */
export class DependencyTracker {
  constructor(
    readonly storage: Storage,
    readonly events: TaskqEmitter,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Record `child` as a dependent on each parent. */
  async link(childId: JobId, parentIds: JobId[]): Promise<void> {
    for (const pid of parentIds) {
      const parent = await this.storage.get(pid);
      if (!parent) continue;
      if (!parent.dependents.includes(childId)) {
        await this.storage.update(pid, { dependents: [...parent.dependents, childId] });
      }
    }
  }

  /**
   * Move a blocked job to waiting if all of its parents are completed.
   * Safe to call concurrently: the blocked -> waiting move is a CAS, so the job
   * is enqueued at most once.
   */
  async tryUnblock(childId: JobId): Promise<boolean> {
    const child = await this.storage.get(childId);
    if (!child || child.state !== "blocked") return false;
    for (const pid of child.parents) {
      const parent = await this.storage.get(pid);
      if (!parent || parent.state !== "completed") return false;
    }
    const moved = await transition(this, child, "blocked", "waiting");
    if (!moved) return false;
    await this.storage.pushWaiting(childId);
    this.events.emit("unblocked", { queue: moved.queue, jobId: childId });
    this.events.emit("waiting", { queue: moved.queue, jobId: childId });
    return true;
  }

  async onCompleted(parent: JobRecord): Promise<void> {
    for (const childId of parent.dependents) await this.tryUnblock(childId);
  }

  async onFailed(parent: JobRecord): Promise<void> {
    for (const childId of parent.dependents) {
      const failed = await transition(
        this,
        { id: childId, queue: parent.queue },
        "blocked",
        "failed",
        { failedReason: `parent ${parent.id} failed`, finishedAt: this.clock.now() },
      );
      if (!failed) continue;
      this.logger.warn("failing dependent of failed job", { parent: parent.id, child: childId });
      this.events.emit("failed", {
        queue: failed.queue,
        jobId: childId,
        error: new Error(failed.failedReason),
        attemptsMade: failed.attemptsMade,
        willRetry: false,
      });
      await this.onFailed(failed);
    }
  }
}

export interface FlowNode<T = unknown> {
  key: string;
  name: string;
  data: T;
  /** Keys of other nodes in this flow, or ids of jobs that already exist. */
  dependsOn?: string[];
}

/**
 * Order flow nodes so every node comes after the nodes it depends on.
 * References that are not keys in this flow are treated as external job ids.
 * Throws CycleError naming the cycle.
 */
export function topoSortFlow<N extends FlowNode>(nodes: N[]): N[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  if (byKey.size !== nodes.length) throw new Error("flow node keys must be unique");
  const state = new Map<string, "visiting" | "done">();
  const out: N[] = [];
  const stack: string[] = [];
  const visit = (n: N) => {
    const s = state.get(n.key);
    if (s === "done") return;
    if (s === "visiting") {
      const start = stack.indexOf(n.key);
      throw new CycleError([...stack.slice(start), n.key]);
    }
    state.set(n.key, "visiting");
    stack.push(n.key);
    for (const dep of n.dependsOn ?? []) {
      const d = byKey.get(dep);
      if (d) visit(d);
    }
    stack.pop();
    state.set(n.key, "done");
    out.push(n);
  };
  for (const n of nodes) visit(n);
  return out;
}
