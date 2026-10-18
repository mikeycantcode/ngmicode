import { createTaskQ, type TaskQ, type TaskqOptions } from "../src/api/taskq";
import { FakeClock } from "../src/clock/fake-clock";
import type { TaskqEventName, TaskqEvents } from "../src/events/events";
import { flushMicrotasks } from "../src/utils/async";

export interface TestEnv {
  clock: FakeClock;
  tq: TaskQ;
  /** Let all pending promise chains run (no time passes). */
  settle(): Promise<void>;
}

export function setup(opts: Omit<TaskqOptions, "clock"> = {}, start = 1_700_000_000_000): TestEnv {
  const clock = new FakeClock(start);
  const tq = createTaskQ({ seed: 42, ...opts, clock });
  return {
    clock,
    tq,
    settle: async () => {
      for (let i = 0; i < 3; i++) await flushMicrotasks();
    },
  };
}

/** Record every payload of the given events, in order. */
export function record<K extends TaskqEventName>(tq: TaskQ, ...names: K[]): { name: K; payload: TaskqEvents[K] }[] {
  const out: { name: K; payload: TaskqEvents[K] }[] = [];
  for (const name of names) tq.events.on(name, (payload) => out.push({ name, payload }));
  return out;
}
