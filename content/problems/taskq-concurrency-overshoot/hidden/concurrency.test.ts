import { it, expect } from "testkit";
import { setup } from "../helpers";
import { deferred, type Deferred } from "../../src/utils/async";

function gatedHandler() {
  const gates: Deferred<void>[] = [];
  const state = { running: 0, peak: 0, done: 0 };
  const handler = async () => {
    state.running++;
    state.peak = Math.max(state.peak, state.running);
    const g = deferred();
    gates.push(g);
    await g.promise;
    state.running--;
    state.done++;
  };
  return { gates, state, handler };
}

it("never runs more than `concurrency` jobs when a burst is enqueued at once", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("img");
  const h = gatedHandler();
  tq.define("img", "resize", h.handler);
  tq.worker("img", { concurrency: 3 }).start();
  await Promise.all(Array.from({ length: 12 }, (_, i) => q.add("resize", i)));
  await settle();
  expect(h.state.running).toBe(3);
  // release one at a time; slots must be refilled, never exceeded
  for (let i = 0; i < 12; i++) {
    h.gates.shift()?.resolve();
    await settle();
    expect(h.state.running).toBeLessThanOrEqual(3);
  }
  expect(h.state.peak).toBe(3);
  expect(h.state.done).toBe(12);
});

it("does not lose wake-ups: every job of repeated bursts eventually runs", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("img");
  const h = gatedHandler();
  tq.define("img", "resize", h.handler);
  tq.worker("img", { concurrency: 2 }).start();
  for (let burst = 0; burst < 3; burst++) {
    await Promise.all(Array.from({ length: 5 }, (_, i) => q.add("resize", burst * 10 + i)));
    q.pause();
    q.resume();
    h.gates.shift()?.resolve();
  }
  for (let i = 0; i < 40 && h.state.done < 15; i++) {
    for (const g of h.gates.splice(0)) g.resolve();
    await settle();
  }
  expect(h.state.peak).toBeLessThanOrEqual(2);
  expect(h.state.done).toBe(15);
  expect((await q.getCounts()).waiting).toBe(0);
});

it("picks up jobs that become ready while the worker is mid-claim", async () => {
  const { tq, settle } = setup();
  const q = tq.queue("etl");
  const ran: string[] = [];
  tq.define("etl", "*", (ctx) => {
    ran.push(ctx.job.name);
  });
  tq.worker("etl", { concurrency: 2 }).start();
  await q.addFlow([
    { key: "a", name: "a", data: null },
    { key: "b", name: "b", data: null, dependsOn: ["a"] },
    { key: "c", name: "c", data: null, dependsOn: ["b"] },
    { key: "d", name: "d", data: null, dependsOn: ["b"] },
    { key: "e", name: "e", data: null, dependsOn: ["c", "d"] },
  ]);
  await settle();
  expect(ran).toHaveLength(5);
  expect((await q.getCounts()).completed).toBe(5);
});
