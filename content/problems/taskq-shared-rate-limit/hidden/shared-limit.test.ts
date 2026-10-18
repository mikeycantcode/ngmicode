import { it, expect } from "testkit";
import { setup, recordStarts } from "../helpers";

it("recordStarts returns a live list of start times for one queue only", async () => {
  const { tq, clock, settle } = setup();
  const a = tq.queue("a");
  const b = tq.queue("b");
  tq.define("a", "x", () => {});
  tq.define("b", "x", () => {});
  const starts = recordStarts(tq, "a");
  tq.worker("a").start();
  tq.worker("b").start();
  await a.add("x", 1);
  await b.add("x", 1);
  await settle();
  expect(starts).toEqual([clock.now()]);
  await clock.advance(250);
  await a.add("x", 2);
  await settle();
  expect(starts).toEqual([clock.now() - 250, clock.now()]);
});

it("enforces one sliding-window budget across all workers of a queue", async () => {
  const { tq, clock, settle } = setup();
  const t0 = clock.now();
  const q = tq.queue("payments", { rateLimit: { max: 3, duration: 1000 } });
  tq.define("payments", "charge", () => {});
  const starts = recordStarts(tq, "payments");
  tq.worker("payments", { concurrency: 5 }).start();
  tq.worker("payments", { concurrency: 5 }).start();
  for (let i = 0; i < 8; i++) await q.add("charge", i);
  await settle();
  expect(starts.map((t) => t - t0)).toEqual([0, 0, 0]);
  await clock.advance(400);
  // a worker that joins mid-window gets no fresh budget
  tq.worker("payments", { concurrency: 5 }).start();
  await settle();
  expect(starts).toHaveLength(3);
  await clock.advance(600);
  expect(starts.map((t) => t - t0)).toEqual([0, 0, 0, 1000, 1000, 1000]);
  await clock.advance(1000);
  expect(starts).toHaveLength(8);
});
