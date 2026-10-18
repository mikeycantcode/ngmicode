import { it, expect } from "testkit";
import { setup, record } from "../helpers";
import { deferred } from "../../src/utils/async";

/** Job's first run hangs (frozen worker); its lock expires and a second run starts. */
async function stalledScenario(opts: { attempts?: number; backoff?: number } = {}) {
  const env = setup({ scheduler: { stalledInterval: 5000 } });
  const { tq, clock, settle } = env;
  const q = tq.queue("hooks");
  const firstRun = deferred<string>();
  const secondRun = deferred<string>();
  let calls = 0;
  tq.define("hooks", "deliver", async () => {
    calls++;
    return calls === 1 ? firstRun.promise : secondRun.promise;
  });
  const events = record(tq, "completed", "failed", "retrying");
  tq.worker("hooks", { lockDuration: 1000, concurrency: 2 }).start();
  tq.scheduler.start();
  const job = await q.add("deliver", null, opts);
  await settle();
  clock.jump(2000);
  await tq.scheduler.tick();
  await settle();
  return { ...env, q, job, firstRun, secondRun, events, calls: () => calls };
}

it("a stale run finishing late does not complete the job a second time", async () => {
  const s = await stalledScenario();
  expect(s.calls()).toBe(2);
  s.secondRun.resolve("second");
  await s.settle();
  s.firstRun.resolve("first"); // frozen worker wakes up
  await s.clock.advance(0);
  expect(s.events.filter((e) => e.name === "completed")).toHaveLength(1);
  const stored = (await s.q.getJob(s.job.id))!;
  expect(stored.state).toBe("completed");
  expect(stored.returnValue).toBe("second");
});

it("a stale run failing late does not schedule a retry of a completed job", async () => {
  const s = await stalledScenario({ attempts: 3, backoff: 1000 });
  s.secondRun.resolve("second");
  await s.settle();
  s.firstRun.reject(new Error("socket hang up"));
  await s.clock.advance(10_000);
  expect(s.calls()).toBe(2);
  expect(s.events.map((e) => e.name)).toEqual(["completed"]);
  expect((await s.q.getJob(s.job.id))!.state).toBe("completed");
});

it("a stale completion does not release dependents while the live run is still going", async () => {
  const s = await stalledScenario();
  const child = await s.q.add("deliver", null, { dependsOn: [s.job.id] });
  s.firstRun.resolve("first");
  await s.clock.advance(0);
  expect((await s.q.getJob(s.job.id))!.state).toBe("active");
  expect((await s.q.getJob(child.id))!.state).toBe("blocked");
  expect(s.events).toHaveLength(0);
});
