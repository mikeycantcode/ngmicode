import { it, expect } from "testkit";
import { setup } from "../helpers";
import { InvalidJobOptionsError } from "../../src/core/errors";
import { deferred, type Deferred } from "../../src/utils/async";

it("runs one job per group at a time, in add order, across several workers", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("orders");
  const gates = new Map<string, Deferred<void>>();
  const running = new Map<string, number>();
  const started: string[] = [];
  let violations = 0;
  tq.define("orders", "sync", async (ctx) => {
    const { id, group } = ctx.data as { id: string; group?: string };
    const g = group ?? id;
    running.set(g, (running.get(g) ?? 0) + 1);
    if (running.get(g)! > 1) violations++;
    started.push(id);
    const d = deferred<void>();
    gates.set(id, d);
    await d.promise;
    running.set(g, running.get(g)! - 1);
  });
  tq.worker("orders", { concurrency: 2 }).start();
  tq.worker("orders", { concurrency: 2 }).start();
  const add = (id: string, group?: string, priority = 0) => q.add("sync", { id, group }, { group, priority });
  await add("a1", "u1", 5);
  await add("b1", "u2");
  await add("a2", "u1", 0);
  await add("c", undefined, 9);
  await add("a3", "u1", -3);
  await add("b2", "u2");
  await settle();
  expect([...started].sort()).toEqual(["a1", "b1", "c"]);
  for (const id of ["a1", "b1", "a2", "c", "b2", "a3"]) {
    gates.get(id)!.resolve();
    await settle();
  }
  expect(violations).toBe(0);
  expect(started.filter((s) => s.startsWith("a"))).toEqual(["a1", "a2", "a3"]);
  expect(started.filter((s) => s.startsWith("b"))).toEqual(["b1", "b2"]);
  expect((await q.getCounts()).completed).toBe(6);
});

it("a job waiting out a retry backoff keeps its group blocked", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("orders");
  const log: string[] = [];
  tq.define("orders", "sync", (ctx) => {
    const id = ctx.data as string;
    log.push(id);
    if (id === "a1" && ctx.attempt === 1) throw new Error("409 conflict");
  });
  tq.worker("orders", { concurrency: 4 }).start();
  tq.scheduler.start();
  await q.add("sync", "a1", { group: "u1", attempts: 2, backoff: 1000 });
  await q.add("sync", "a2", { group: "u1" });
  await q.add("sync", "x", {});
  await settle();
  expect(log).toEqual(["a1", "x"]);
  await clock.advance(1000);
  expect(log).toEqual(["a1", "x", "a1", "a2"]);
});

it("a terminal failure releases the group; group can't be combined with delay", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("orders");
  const log: string[] = [];
  tq.define("orders", "sync", (ctx) => {
    log.push(ctx.data as string);
    if (ctx.data === "a1") throw new Error("bad payload");
  });
  tq.worker("orders", { concurrency: 2 }).start();
  await q.add("sync", "a1", { group: "u1" });
  await q.add("sync", "a2", { group: "u1" });
  await settle();
  expect(log).toEqual(["a1", "a2"]);
  await expect(q.add("sync", "z", { group: "u1", delay: 10 })).rejects.toThrow(InvalidJobOptionsError);
});
