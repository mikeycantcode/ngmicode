import { it, expect } from "testkit";
import { setup } from "../helpers";
import { createRng } from "../../src/utils/rng";

async function runAll(priorities: number[]) {
  const { tq } = setup();
  const q = tq.queue("o");
  const order: number[] = [];
  tq.define("o", "x", async (ctx) => {
    order.push(ctx.data as number);
  });
  for (let i = 0; i < priorities.length; i++) await q.add("x", i, { priority: priorities[i] });
  const drained = tq.events.waitFor("drained");
  tq.worker("o").start();
  await drained;
  return order;
}

it("runs equal-priority jobs strictly FIFO while the backlog grows and shrinks", async () => {
  const { tq, clock } = setup();
  const q = tq.queue("o");
  const order: number[] = [];
  tq.define("o", "x", async (ctx) => {
    await ctx.sleep(10);
    order.push(ctx.data as number);
  });
  tq.worker("o").start();
  // bursts of enqueues interleaved with processing
  let next = 0;
  for (let burst = 0; burst < 6; burst++) {
    for (let k = 0; k < 7; k++) await q.add("x", next++);
    await clock.advance(25);
  }
  await clock.advance(10 * next);
  expect(order).toEqual(Array.from({ length: next }, (_, i) => i));
});

it("runs mixed priorities lowest-first, FIFO within a priority", async () => {
  const rng = createRng(2024);
  const priorities = Array.from({ length: 60 }, () => Math.floor(rng() * 4));
  const expected = priorities
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.i);
  const order = await runAll(priorities);
  expect(order).toEqual(expected);
});
