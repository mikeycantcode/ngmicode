import { it, expect } from "testkit";
import { setup, record } from "../helpers";
import { JobNotFoundError } from "../../src/core/errors";
import { deferred } from "../../src/utils/async";

it("cancels waiting and delayed jobs so they never run", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("c");
  let runs = 0;
  tq.define("c", "x", () => {
    runs++;
  });
  const ev = record(tq, "cancelled");
  const waiting = await q.add("x", null);
  const delayed = await q.add("x", null, { delay: 1000 });
  expect(await q.cancel(waiting.id)).toBe(true);
  expect(await q.cancel(delayed.id, "user unsubscribed")).toBe(true);
  expect(await q.cancel(waiting.id)).toBe(false);
  await expect(q.cancel("nope")).rejects.toThrow(JobNotFoundError);
  tq.worker("c").start();
  tq.scheduler.start();
  await settle();
  await clock.advance(5000);
  expect(runs).toBe(0);
  expect((await q.getJob(waiting.id))!.state).toBe("cancelled");
  expect((await q.getCounts()).cancelled).toBe(2);
  expect(ev.map((e) => e.payload)).toEqual([
    { queue: "c", jobId: waiting.id, prevState: "waiting", reason: "cancelled" },
    { queue: "c", jobId: delayed.id, prevState: "delayed", reason: "user unsubscribed" },
  ]);
});

it("cancelling a job that is waiting out a retry backoff stops further tries", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("c");
  let runs = 0;
  tq.define("c", "x", () => {
    runs++;
    throw new Error("503");
  });
  tq.worker("c").start();
  tq.scheduler.start();
  const job = await q.add("x", null, { attempts: 3, backoff: 1000 });
  await settle();
  expect((await q.getJob(job.id))!.state).toBe("delayed");
  expect(await q.cancel(job.id)).toBe(true);
  await clock.advance(10_000);
  expect(runs).toBe(1);
  expect((await q.getJob(job.id))!.state).toBe("cancelled");
});

it("cancelling an active job aborts its signal and discards whatever the handler does next", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("c", { deadLetter: true });
  const gates = new Map<string, ReturnType<typeof deferred<void>>>();
  const aborted: string[] = [];
  let runs = 0;
  tq.define("c", "x", async (ctx) => {
    runs++;
    const g = deferred<void>();
    gates.set(ctx.data as string, g);
    ctx.signal.onAbort(() => aborted.push(ctx.data as string));
    await g.promise;
    if (ctx.data === "throws") throw new Error("interrupted");
    return "done";
  });
  const ev = record(tq, "completed", "failed", "retrying");
  tq.worker("c", { concurrency: 2 }).start();
  tq.scheduler.start();
  const a = await q.add("x", "throws", { attempts: 3 });
  const b = await q.add("x", "returns", { attempts: 3 });
  await settle();
  expect(await q.cancel(a.id)).toBe(true);
  expect(await q.cancel(b.id)).toBe(true);
  expect(aborted).toEqual(["throws", "returns"]);
  gates.get("throws")!.resolve();
  gates.get("returns")!.resolve();
  await clock.advance(10_000);
  expect(runs).toBe(2);
  expect(ev).toHaveLength(0);
  expect((await q.getJob(a.id))!.state).toBe("cancelled");
  expect((await q.getJob(b.id))!.state).toBe("cancelled");
  expect(tq.dlq.size("c")).toBe(0);
});

it("cascades to blocked dependents", async () => {
  const { tq } = setup();
  const q = tq.queue("c");
  const parent = await q.add("x", null);
  const child = await q.add("x", null, { dependsOn: [parent.id] });
  const grandchild = await q.add("x", null, { dependsOn: [child.id] });
  expect(await q.cancel(parent.id)).toBe(true);
  expect((await q.getJob(child.id))!.state).toBe("cancelled");
  expect((await q.getJob(grandchild.id))!.state).toBe("cancelled");
});
