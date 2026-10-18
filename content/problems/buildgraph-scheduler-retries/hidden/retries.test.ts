import { it, expect } from "testkit";
import { ManualClock } from "../../src/scheduler/clock";
import { runSchedule } from "../../src/scheduler/scheduler";
import { loadConfig } from "../../src/config/config";
import { MemoryCacheStore } from "../../src/cache/cache-store";
import { executorFrom } from "../../src/runner/executors";
import { runTasks } from "../../src/runner/task-runner";
import { sampleRepo } from "../fixtures";

function flaky(clock: ManualClock, ms: number, failures: number) {
  let calls = 0;
  return async () => {
    calls++;
    await clock.sleep(ms);
    if (calls <= failures) throw new Error(`attempt ${calls} failed`);
  };
}

it("continueOnError runs independent tasks and skips dependents of failures", async () => {
  const clock = new ManualClock();
  const t = (id: string, ms: number, deps: string[] = [], fail = false) => ({ id, deps, run: fail ? flaky(clock, ms, 99) : flaky(clock, ms, 0) });
  const r = await clock.run(
    runSchedule([t("a", 10, [], true), t("b", 30), t("c", 5, ["a"]), t("d", 5, ["c"]), t("e", 10, ["b"])], { concurrency: 2, clock, continueOnError: true }),
  );
  expect(r.ok).toBe(false);
  expect(r.outcomes.map((o) => [o.id, o.status])).toEqual([["a", "failed"], ["b", "success"], ["c", "skipped"], ["d", "skipped"], ["e", "success"]]);
  expect(r.outcomes.find((o) => o.id === "e")!.finishedAt).toBe(40);
});

it("retries with exponential backoff on the injected clock", async () => {
  const clock = new ManualClock();
  const r = await clock.run(
    runSchedule(
      [
        { id: "flaky", deps: [], run: flaky(clock, 10, 2), retries: 2, retryDelayMs: 100 },
        { id: "doomed", deps: [], run: flaky(clock, 10, 99), retries: 1, retryDelayMs: 100 },
      ],
      { concurrency: 2, clock, continueOnError: true },
    ),
  );
  const flakyOutcome = r.outcomes.find((o) => o.id === "flaky")!;
  expect([flakyOutcome.status, flakyOutcome.attempts, flakyOutcome.startedAt, flakyOutcome.finishedAt]).toEqual(["success", 3, 0, 330]);
  const doomed = r.outcomes.find((o) => o.id === "doomed")!;
  expect([doomed.status, doomed.attempts, doomed.finishedAt]).toEqual(["failed", 2, 120]);
  expect(r.ok).toBe(false);
});

it("releases the concurrency slot during backoff and never oversubscribes", async () => {
  const clock = new ManualClock();
  const r = await clock.run(
    runSchedule(
      [
        { id: "flaky", deps: [], run: flaky(clock, 10, 1), retries: 1, retryDelayMs: 100 },
        { id: "other", deps: [], run: flaky(clock, 50, 0) },
        { id: "after", deps: ["flaky"], run: flaky(clock, 5, 0) },
      ],
      { concurrency: 1, clock },
    ),
  );
  expect(r.ok).toBe(true);
  expect(r.maxConcurrency).toBe(1);
  const at = Object.fromEntries(r.outcomes.map((o) => [o.id, [o.startedAt, o.finishedAt, o.attempts]]));
  expect(at).toEqual({ flaky: [0, 120, 2], other: [10, 60, 1], after: [120, 125, 1] });
});

it("wires retries and continueOnError through config and runTasks", async () => {
  const fs = sampleRepo({
    "buildgraph.json": JSON.stringify({
      pipeline: { build: { dependsOn: ["^build"], outputs: ["dist/**"] }, test: { dependsOn: ["build"], retries: 1, retryDelayMs: 50 } },
    }),
  });
  const clock = new ManualClock();
  const calls: Record<string, number> = {};
  const executor = executorFrom(async ({ node }) => {
    calls[node.id] = (calls[node.id] ?? 0) + 1;
    await clock.sleep(10);
    if (node.id === "@acme/ui#test" && calls[node.id] === 1) return { exitCode: 1, logs: ["flake"] };
    if (node.id === "@acme/utils#test") return { exitCode: 1, logs: ["broken"] };
    return { exitCode: 0, logs: [] };
  });
  const s = await clock.run(
    runTasks({ fs, config: loadConfig(fs), env: {}, clock, cache: new MemoryCacheStore(), executor }, { tasks: ["test"], continueOnError: true }),
  );
  const byId = Object.fromEntries(s.tasks.map((t) => [t.id, [t.status, t.attempts]]));
  expect(s.ok).toBe(false);
  expect(byId["@acme/ui#test"]).toEqual(["executed", 2]);
  expect(byId["@acme/utils#test"]).toEqual(["failed", 2]);
  expect(byId["@acme/web#test"]).toEqual(["executed", 1]);
  expect(byId["@acme/web#build"]).toEqual(["executed", 1]);
});
