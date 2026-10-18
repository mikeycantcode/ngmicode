import { it, expect } from "testkit";
import { setup, record } from "../helpers";
import { InvalidJobOptionsError } from "../../src/core/errors";

it("keeps the N most recent completed jobs, breaking finishedAt ties by add order", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("r", { defaultJobOptions: { removeOnComplete: 2 } });
  tq.define("r", "x", () => "ok");
  const removed = record(tq, "removed");
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push((await q.add("x", i)).id);
  tq.worker("r").start();
  await settle();
  // all four finish at the same fake-clock instant
  expect(removed.map((e) => e.payload.jobId)).toEqual([ids[0], ids[1]]);
  expect(removed[0].payload).toMatchObject({ queue: "r", prevState: "completed" });
  expect((await q.getJobs("completed")).map((j) => j.id)).toEqual([ids[2], ids[3]]);
});

it("lets the job's own option override the queue default, and validates values", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("r", { defaultJobOptions: { removeOnComplete: true } });
  tq.define("r", "x", () => "ok");
  const a = await q.add("x", 1);
  const b = await q.add("x", 2, { removeOnComplete: false });
  const c = await q.add("x", 3);
  tq.worker("r").start();
  await settle();
  expect(await q.getJob(a.id)).toBeUndefined();
  expect((await q.getJob(b.id))!.state).toBe("completed");
  expect(await q.getJob(c.id)).toBeUndefined();
  await expect(q.add("x", 4, { removeOnComplete: -1 })).rejects.toThrow(InvalidJobOptionsError);
  await expect(q.add("x", 4, { removeOnFail: 1.5 as any })).rejects.toThrow("removeOnFail must be a boolean or a non-negative integer");
});

it("removeOnFail applies only to terminal failures and never to dead-lettered jobs", async () => {
  const { tq, settle } = setup();
  const plain = tq.queue("plain");
  const withDlq = tq.queue("dlq", { deadLetter: true });
  let calls = 0;
  const seenBetween: (string | undefined)[] = [];
  tq.define("plain", "x", async (ctx) => {
    calls++;
    seenBetween.push((await plain.getJob(ctx.job.id))?.state);
    throw new Error("boom");
  });
  tq.define("dlq", "x", () => {
    throw new Error("boom");
  });
  const p = await plain.add("x", null, { attempts: 2, removeOnFail: true });
  const d = await withDlq.add("x", null, { removeOnFail: true });
  tq.worker("plain").start();
  tq.worker("dlq").start();
  await settle();
  expect(calls).toBe(2);
  expect(seenBetween).toEqual(["active", "active"]);
  expect(await plain.getJob(p.id)).toBeUndefined();
  expect((await withDlq.getJob(d.id))!.state).toBe("failed");
  expect(tq.dlq.has(d.id)).toBe(true);
});

it("never removes a completed job that still has a blocked dependent", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("r");
  tq.define("r", "*", () => "ok");
  const p1 = await q.add("p1", null, { removeOnComplete: true });
  const p2 = await q.add("p2", null, { delay: 1000 });
  const child = await q.add("child", null, { dependsOn: [p1.id, p2.id] });
  tq.worker("r").start();
  tq.scheduler.start();
  await settle();
  expect((await q.getJob(p1.id))!.state).toBe("completed");
  await tq.admin.promote(p2.id);
  await settle();
  expect((await q.getJob(child.id))!.state).toBe("completed");
});
