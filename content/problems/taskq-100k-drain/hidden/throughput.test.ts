import { it, expect } from "testkit";
import { setup } from "../helpers";
import { deferred } from "../../src/utils/async";

// The runner's per-test timeout can't interrupt a pure promise chain, so the
// test enforces its own wall-clock budget and pauses the queue when it's blown.
const N = 100_000;
const BUDGET_MS = 1500;

async function drain(concurrency: number) {
  const { tq } = setup();
  const q = tq.queue("bulk");
  const started = Date.now();
  await q.addBulk(Array.from({ length: N }, (_, i) => ({ name: "n", data: i, opts: { priority: i % 3 } })));
  const seen: number[] = [];
  const done = deferred<void>();
  tq.define("bulk", "n", (ctx) => {
    seen.push(ctx.data as number);
    if (Date.now() - started > BUDGET_MS) {
      q.pause();
      done.resolve();
    }
  });
  tq.events.on("drained", (p) => p.queue === "bulk" && done.resolve());
  tq.worker("bulk", { concurrency }).start();
  await done.promise;
  return { tq, q, seen, elapsed: Date.now() - started };
}

it("drains 100k queued jobs within the budget, in priority order", async () => {
  const { q, seen, elapsed } = await drain(1);
  expect(elapsed).toBeLessThan(BUDGET_MS);
  expect(seen).toHaveLength(N);
  // priority 0 first (insertion order), then 1, then 2
  expect(seen[0]).toBe(0);
  expect(seen[1]).toBe(3);
  expect(seen[33_334]).toBe(1);
  expect(seen[N - 1]).toBe(99_998);
  expect((await q.getCounts()).completed).toBe(N);
});

it("stays fast with a wide worker", async () => {
  const { seen, elapsed } = await drain(64);
  expect(elapsed).toBeLessThan(BUDGET_MS);
  expect(seen).toHaveLength(N);
});
