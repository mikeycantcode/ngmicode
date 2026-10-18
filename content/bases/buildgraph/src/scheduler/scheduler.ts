import type { EventBus } from "../core/events";
import { systemClock, type Clock } from "./clock";

export interface ScheduledTask {
  id: string;
  /** Ids of tasks that must succeed before this one starts. */
  deps: string[];
  run: () => Promise<void>;
}

export type OutcomeStatus = "success" | "failed" | "skipped";

export interface TaskOutcome {
  id: string;
  status: OutcomeStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: unknown;
}

export interface ScheduleOptions {
  concurrency: number;
  clock?: Clock;
  bus?: EventBus;
}

export interface ScheduleResult {
  ok: boolean;
  /** One outcome per task, in the order tasks were given. */
  outcomes: TaskOutcome[];
  /** Task ids in the order they started. */
  startOrder: string[];
  /** Highest number of tasks observed running at once. */
  maxConcurrency: number;
}

/**
 * Runs tasks respecting dependencies with at most `concurrency` in flight.
 *
 * Ready tasks start in the order they were passed in (callers pass a topological
 * order, so this is deterministic). Fail-fast: after the first failure no new task
 * starts; tasks already running are allowed to finish, and the returned promise
 * resolves only once they have. Every task that never started is "skipped".
 */
export function runSchedule(tasks: ScheduledTask[], opts: ScheduleOptions): Promise<ScheduleResult> {
  const clock = opts.clock ?? systemClock;
  const concurrency = Math.max(1, Math.floor(opts.concurrency));
  const index = new Map(tasks.map((t, i) => [t.id, i]));
  const waitingOn = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of tasks) {
    waitingOn.set(t.id, t.deps.length);
    for (const d of t.deps) {
      if (!index.has(d)) throw new Error(`runSchedule: ${t.id} depends on unknown task ${d}`);
      (dependents.get(d) ?? dependents.set(d, []).get(d)!).push(t.id);
    }
  }

  const outcomes = new Map<string, TaskOutcome>();
  const startOrder: string[] = [];
  const ready: string[] = tasks.filter((t) => t.deps.length === 0).map((t) => t.id);
  let running = 0;
  let maxConcurrency = 0;
  let failed = false;

  return new Promise((resolve) => {
    const finish = () => {
      const list = tasks.map((t) => outcomes.get(t.id) ?? { id: t.id, status: "skipped" as const });
      resolve({ ok: !failed && list.every((o) => o.status === "success"), outcomes: list, startOrder, maxConcurrency });
    };

    const enqueue = (id: string) => {
      // keep `ready` ordered by original position
      const pos = index.get(id)!;
      let i = ready.length;
      while (i > 0 && index.get(ready[i - 1])! > pos) i--;
      ready.splice(i, 0, id);
    };

    const start = (id: string) => {
      const task = tasks[index.get(id)!];
      const outcome: TaskOutcome = { id, status: "success", startedAt: clock.now() };
      outcomes.set(id, outcome);
      startOrder.push(id);
      running++;
      maxConcurrency = Math.max(maxConcurrency, running);
      Promise.resolve()
        .then(task.run)
        .then(
          () => {
            for (const dep of dependents.get(id) ?? []) {
              const left = waitingOn.get(dep)! - 1;
              waitingOn.set(dep, left);
              if (left === 0) enqueue(dep);
            }
          },
          (e) => {
            outcome.status = "failed";
            outcome.error = e;
            failed = true;
          },
        )
        .then(() => {
          outcome.finishedAt = clock.now();
          running--;
          pump();
        });
    };

    const pump = () => {
      while (!failed && running < concurrency && ready.length) start(ready.shift()!);
      if (running === 0) finish();
    };

    pump();
  });
}
