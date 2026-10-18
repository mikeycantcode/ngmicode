import { it, expect } from "testkit";
import { setup, record } from "../helpers";
import { QueueClosedError } from "../../src/core/errors";
import { deferred } from "../../src/utils/async";

function track(p: Promise<unknown>) {
  const s = { done: false };
  p.then(() => (s.done = true));
  return s;
}

it("waits for in-flight jobs, starts nothing new, and rejects new adds", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("s");
  const started: number[] = [];
  tq.define("s", "x", async (ctx) => {
    started.push(ctx.data as number);
    await ctx.sleep(5000);
    return "ok";
  });
  tq.worker("s").start();
  const a = await q.add("x", 1);
  const b = await q.add("x", 2);
  await settle();
  const closing = track(tq.close({ timeoutMs: 10_000 }));
  await expect(q.add("x", 3)).rejects.toThrow(QueueClosedError);
  await clock.advance(4999);
  expect(closing.done).toBe(false);
  await clock.advance(1);
  expect(closing.done).toBe(true);
  expect((await q.getJob(a.id))!.state).toBe("completed");
  expect((await q.getJob(b.id))!.state).toBe("waiting");
  expect(started).toEqual([1]);
});

it("after the timeout, aborts stragglers and returns them to waiting without using an attempt", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("s");
  const never = deferred<string>();
  let aborted = false;
  tq.define("s", "x", async (ctx) => {
    ctx.signal.onAbort(() => (aborted = true));
    return never.promise; // ignores the signal
  });
  const ev = record(tq, "completed", "failed");
  tq.worker("s", { concurrency: 2 }).start();
  const job = await q.add("x", null, { attempts: 3 });
  await settle();
  const closing = track(tq.close({ timeoutMs: 1000 }));
  await clock.advance(999);
  expect(closing.done).toBe(false);
  await clock.advance(1);
  expect(closing.done).toBe(true);
  expect(aborted).toBe(true);
  let stored = (await q.getJob(job.id))!;
  expect(stored.state).toBe("waiting");
  expect(stored.attemptsMade).toBe(0);
  never.resolve("too late");
  await clock.advance(60_000);
  stored = (await q.getJob(job.id))!;
  expect(stored.state).toBe("waiting");
  expect(stored.returnValue).toBeUndefined();
  expect(ev).toHaveLength(0);
});

it("is idempotent, stops the scheduler, and emits closed exactly once", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("s");
  let runs = 0;
  tq.define("s", "x", () => {
    runs++;
  });
  const closedEv = record(tq, "closed");
  tq.worker("s").start();
  tq.scheduler.start();
  const later = await q.add("x", null, { delay: 500 });
  await settle();
  const p1 = tq.close();
  const p2 = tq.close({ timeoutMs: 1 });
  await Promise.all([p1, p2]);
  await tq.close();
  await clock.advance(5000);
  expect(runs).toBe(0);
  expect((await q.getJob(later.id))!.state).toBe("delayed");
  expect(closedEv).toHaveLength(1);
});
