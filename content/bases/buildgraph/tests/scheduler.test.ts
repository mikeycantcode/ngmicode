import { describe, it, expect } from "testkit";
import { ManualClock } from "../src/scheduler/clock";
import { runSchedule, type ScheduledTask } from "../src/scheduler/scheduler";

function task(clock: ManualClock, id: string, ms: number, deps: string[] = [], fail = false): ScheduledTask {
  return {
    id,
    deps,
    run: async () => {
      await clock.sleep(ms);
      if (fail) throw new Error(`${id} failed`);
    },
  };
}

describe("ManualClock", () => {
  it("fires timers in deadline order", async () => {
    const clock = new ManualClock();
    const seen: string[] = [];
    clock.sleep(20).then(() => seen.push("b"));
    clock.sleep(10).then(() => seen.push("a"));
    await clock.advance(15);
    expect(seen).toEqual(["a"]);
    expect(clock.now()).toBe(15);
    await clock.advance(10);
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("runSchedule", () => {
  it("respects dependencies and the concurrency limit", async () => {
    const clock = new ManualClock();
    const tasks = [
      task(clock, "a", 10),
      task(clock, "b", 30),
      task(clock, "c", 10),
      task(clock, "d", 10, ["a", "b"]),
    ];
    const r = await clock.run(runSchedule(tasks, { concurrency: 2, clock }));
    expect(r.ok).toBe(true);
    expect(r.maxConcurrency).toBe(2);
    expect(r.startOrder).toEqual(["a", "b", "c", "d"]);
    const at = Object.fromEntries(r.outcomes.map((o) => [o.id, [o.startedAt, o.finishedAt]]));
    expect(at).toEqual({ a: [0, 10], b: [0, 30], c: [10, 20], d: [30, 40] });
  });

  it("fails fast but lets running tasks finish", async () => {
    const clock = new ManualClock();
    const tasks = [task(clock, "slow", 50), task(clock, "bad", 10, [], true), task(clock, "after", 10, ["slow"]), task(clock, "queued", 5)];
    const r = await clock.run(runSchedule(tasks, { concurrency: 2, clock }));
    expect(r.ok).toBe(false);
    expect(r.outcomes.map((o) => [o.id, o.status])).toEqual([
      ["slow", "success"],
      ["bad", "failed"],
      ["after", "skipped"],
      ["queued", "skipped"],
    ]);
    expect(clock.now()).toBe(50);
  });
});
