import { describe, it, expect } from "testkit";
import { setup, record } from "./helpers";
import { UnrecoverableError } from "../src/core/errors";

describe("retries", () => {
  it("retries with exponential backoff, then succeeds", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("pay");
    const calls: number[] = [];
    tq.define("pay", "charge", async (ctx) => {
      calls.push(clock.now());
      if (ctx.attempt < 3) throw new Error("gateway 502");
      return "ok";
    });
    tq.worker("pay").start();
    tq.scheduler.start();
    const t0 = clock.now();
    const job = await q.add("charge", { cents: 500 }, { attempts: 2, backoff: { type: "exponential", delay: 1000 } });
    await settle();
    await clock.advance(1000);
    await clock.advance(2000);
    expect(calls.map((t) => t - t0)).toEqual([0, 1000, 3000]);
    const stored = (await q.getJob(job.id))!;
    expect(stored.state).toBe("completed");
    expect(stored.attemptsMade).toBe(3);
    expect(stored.stacktrace).toHaveLength(2);
  });

  it("exhausted jobs land in the dead-letter queue and can be replayed", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("pay", { deadLetter: true });
    let fail = true;
    let calls = 0;
    tq.define("pay", "charge", () => {
      calls++;
      if (fail) throw new Error("card declined");
    });
    const events = record(tq, "failed", "dead");
    tq.worker("pay").start();
    const job = await q.add("charge", null, { attempts: 1 });
    await settle();
    expect(calls).toBe(2);
    expect(events.map((e) => e.name)).toEqual(["failed", "failed", "dead"]);
    expect(tq.dlq.list("pay")).toHaveLength(1);
    expect(tq.dlq.list("pay")[0]).toMatchObject({ jobId: job.id, reason: "card declined", attemptsMade: 2 });

    fail = false;
    await tq.dlq.replay(job.id);
    await settle();
    expect((await q.getJob(job.id))!.state).toBe("completed");
    expect(tq.dlq.size("pay")).toBe(0);
  });

  it("UnrecoverableError skips remaining attempts", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("pay");
    let calls = 0;
    tq.define("pay", "charge", () => {
      calls++;
      throw new UnrecoverableError("fraud");
    });
    tq.worker("pay").start();
    await q.add("charge", null, { attempts: 5 });
    await settle();
    expect(calls).toBe(1);
  });

  it("exposes attempt info to handlers", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("pay");
    const seen: [number, boolean][] = [];
    tq.define("pay", "charge", (ctx) => {
      seen.push([ctx.attempt, ctx.isLastAttempt]);
      throw new Error("nope");
    });
    tq.worker("pay").start();
    await q.add("charge", null, { attempts: 1 });
    await settle();
    expect(seen).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});
