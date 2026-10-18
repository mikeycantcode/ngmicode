import { it, expect } from "testkit";
import { setup, record } from "../helpers";

it("attempts: 3 means three tries in total, and only the third is the last attempt", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("billing", { deadLetter: true });
  const seen: [number, boolean][] = [];
  tq.define("billing", "charge", (ctx) => {
    seen.push([ctx.attempt, ctx.isLastAttempt]);
    throw new Error("gateway 502");
  });
  const events = record(tq, "dead");
  tq.worker("billing").start();
  tq.scheduler.start();
  const job = await q.add("charge", { cents: 1999 }, { attempts: 3, backoff: 1000 });
  await settle();
  await clock.advance(10_000);
  expect(seen).toEqual([
    [1, false],
    [2, false],
    [3, true],
  ]);
  const stored = (await q.getJob(job.id))!;
  expect(stored.state).toBe("failed");
  expect(stored.attemptsMade).toBe(3);
  expect(events).toHaveLength(1);
});

it("the default is a single try with no retry", async () => {
  const { tq, clock, settle } = setup();
  const q = tq.queue("billing");
  const seen: boolean[] = [];
  tq.define("billing", "charge", (ctx) => {
    seen.push(ctx.isLastAttempt);
    throw new Error("declined");
  });
  tq.worker("billing").start();
  tq.scheduler.start();
  const job = await q.add("charge", null);
  await settle();
  await clock.advance(10_000);
  expect(seen).toEqual([true]);
  expect((await q.getJob(job.id))!.state).toBe("failed");
});
