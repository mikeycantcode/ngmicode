import { it, expect } from "testkit";
import { setup, record } from "../helpers";
import { InvalidTransitionError } from "../../src/core/errors";
import { deferred } from "../../src/utils/async";

function transitions(events: { payload: { jobId: string; from: string; to: string } }[], jobId: string) {
  return events.filter((e) => e.payload.jobId === jobId).map((e) => `${e.payload.from}>${e.payload.to}`);
}

it("emits one state:changed per transition through retry and delayed promotion", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("t");
  tq.define("t", "x", (ctx) => {
    if (ctx.attempt === 1) throw new Error("flaky");
    return "ok";
  });
  const ev = record(tq, "state:changed");
  tq.worker("t").start();
  tq.scheduler.start();
  const job = await q.add("x", null, { attempts: 3, backoff: 500 });
  const quick = await q.add("x", null, { attempts: 2 });
  await settle();
  await clock.advance(500);
  expect(transitions(ev, job.id)).toEqual(["waiting>active", "active>delayed", "delayed>waiting", "waiting>active", "active>completed"]);
  expect(transitions(ev, quick.id)).toEqual(["waiting>active", "active>waiting", "waiting>active", "active>completed"]);
  expect(ev[0].payload.queue).toBe("t");
});

it("covers dependency, dead-letter and stalled-job paths", async () => {
  const { tq, clock, settle } = setup({ scheduler: { stalledInterval: 5000 } });
  const q = tq.queue("t", { deadLetter: true });
  let fail = true;
  const gate = deferred();
  let hangs = 0;
  tq.define("t", "boom", () => {
    if (fail) throw new Error("nope");
  });
  tq.define("t", "ok", () => {});
  tq.define("t", "hang", async () => {
    if (hangs++ === 0) await gate.promise;
  });
  const ev = record(tq, "state:changed");
  const parent = await q.add("boom", null);
  const child = await q.add("ok", null, { dependsOn: [parent.id] });
  const w = tq.worker("t", { lockDuration: 1000, concurrency: 2 }).start();
  tq.scheduler.start();
  await settle();
  expect(transitions(ev, parent.id)).toEqual(["waiting>active", "active>failed"]);
  expect(transitions(ev, child.id)).toEqual(["blocked>failed"]);

  fail = false;
  await tq.dlq.replay(parent.id);
  await settle();
  expect(transitions(ev, parent.id).slice(2)).toEqual(["failed>waiting", "waiting>active", "active>completed"]);

  const p2 = await q.add("ok", null, { delay: 100 });
  const c2 = await q.add("ok", null, { dependsOn: [p2.id] });
  await clock.advance(100);
  expect(transitions(ev, c2.id)).toEqual(["blocked>waiting", "waiting>active", "active>completed"]);

  const h = await q.add("hang", null);
  await settle();
  clock.jump(2000);
  await tq.scheduler.tick();
  await settle();
  gate.resolve();
  await clock.advance(0);
  expect(transitions(ev, h.id)).toEqual(["waiting>active", "active>waiting", "waiting>active", "active>completed"]);
  void w;
});

it("admin.promote only moves delayed jobs and rejects everything else", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("t");
  const gate = deferred();
  tq.define("t", "x", () => gate.promise);
  const ev = record(tq, "state:changed");
  tq.worker("t").start();
  const active = await q.add("x", null);
  const later = await q.add("x", null, { delay: 60_000 });
  await settle();
  await expect(tq.admin.promote(active.id)).rejects.toThrow(InvalidTransitionError);
  expect((await q.getJob(active.id))!.state).toBe("active");
  await tq.admin.promote(later.id);
  expect(transitions(ev, later.id)).toEqual(["delayed>waiting"]);
  gate.resolve();
  await settle();
  expect((await q.getJob(later.id))!.state).toBe("completed");
  await expect(tq.admin.promote(later.id)).rejects.toThrow(InvalidTransitionError);
  expect((await q.getJob(later.id))!.state).toBe("completed");
  expect(transitions(ev, later.id)).toEqual(["delayed>waiting", "waiting>active", "active>completed"]);
});
