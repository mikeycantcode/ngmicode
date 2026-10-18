import type { EventBus } from "../core/events";
import { systemClock, type Clock } from "./clock";

export interface ScheduledTask {
  id: string;
  /** Ids of tasks that must succeed before this one starts. */
  deps: string[];
  run: () => Promise<void>;
  /** Extra attempts after a failure (default 0). */
  retries?: number;
  /** Base backoff; attempt k waits retryDelayMs * 2^(k-1) (default 100). */
  retryDelayMs?: number;
}

export type OutcomeStatus = "success" | "failed" | "skipped";

export interface TaskOutcome {
  id: string;
  status: OutcomeStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: unknown;
  attempts: number;
}

export interface ScheduleOptions {
  concurrency: number;
  clock?: Clock;
  bus?: EventBus;
  /** Keep starting tasks that don't depend on a failed task. */
  continueOnError?: boolean;
}

export interface ScheduleResult {
  ok: boolean;
  /** One outcome per task, in the order tasks were given. */
  outcomes: TaskOutcome[];
  /** Task ids in the order they started (first attempt only). */
  startOrder: string[];
  /** Highest number of attempts observed running at once. */
  maxConcurrency: number;
}

/**
 * Runs tasks respecting dependencies with at most `concurrency` attempts in flight.
 *
 * Ready tasks start in the order they were passed in. A failed attempt with retries
 * left releases its slot, waits out its backoff on the clock, then re-enters the ready
 * queue. Fail-fast (default): after the first final failure nothing new starts. With
 * continueOnError, only tasks downstream of a failure are skipped. The promise resolves
 * once nothing is running and no backoff is pending.
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
  let backingOff = 0;
  let maxConcurrency = 0;
  let anyFailed = false;
  let stopped = false;
  let done = false;

  return new Promise((resolve) => {
    const finish = () => {
      if (done) return;
      done = true;
      const list = tasks.map((t) => outcomes.get(t.id) ?? { id: t.id, status: "skipped" as const, attempts: 0 });
      resolve({ ok: !anyFailed && list.every((o) => o.status === "success"), outcomes: list, startOrder, maxConcurrency });
    };

    const enqueue = (id: string) => {
      const pos = index.get(id)!;
      let i = ready.length;
      while (i > 0 && index.get(ready[i - 1])! > pos) i--;
      ready.splice(i, 0, id);
    };

    const fail = (outcome: TaskOutcome, e: unknown) => {
      outcome.status = "failed";
      outcome.error = e;
      outcome.finishedAt = clock.now();
      anyFailed = true;
      if (!opts.continueOnError) stopped = true;
    };

    const start = (id: string) => {
      const task = tasks[index.get(id)!];
      let outcome = outcomes.get(id);
      if (!outcome) {
        outcome = { id, status: "success", startedAt: clock.now(), attempts: 0 };
        outcomes.set(id, outcome);
        startOrder.push(id);
      }
      const o = outcome;
      o.attempts++;
      running++;
      maxConcurrency = Math.max(maxConcurrency, running);
      Promise.resolve()
        .then(task.run)
        .then(
          () => {
            o.status = "success";
            o.finishedAt = clock.now();
            for (const dep of dependents.get(id) ?? []) {
              const left = waitingOn.get(dep)! - 1;
              waitingOn.set(dep, left);
              if (left === 0) enqueue(dep);
            }
          },
          (e) => {
            const retries = task.retries ?? 0;
            if (o.attempts <= retries && !stopped) {
              const delay = (task.retryDelayMs ?? 100) * 2 ** (o.attempts - 1);
              backingOff++;
              clock.sleep(delay).then(() => {
                backingOff--;
                if (stopped) fail(o, e);
                else enqueue(id);
                pump();
              });
              return;
            }
            fail(o, e);
          },
        )
        .then(() => {
          running--;
          pump();
        });
    };

    const pump = () => {
      while (!stopped && running < concurrency && ready.length) start(ready.shift()!);
      if (running === 0 && backingOff === 0) finish();
    };

    pump();
  });
}
