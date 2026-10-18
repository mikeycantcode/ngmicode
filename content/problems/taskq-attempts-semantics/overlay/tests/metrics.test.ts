import { describe, it, expect } from "testkit";
import { setup } from "./helpers";

describe("metrics", () => {
  it("counts outcomes and records durations", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("m");
    tq.define("m", "work", async (ctx) => {
      await ctx.sleep(ctx.data as number);
    });
    tq.define("m", "flaky", () => {
      throw new Error("x");
    });
    tq.worker("m", { concurrency: 3 }).start();
    await q.add("work", 100);
    await q.add("work", 300);
    await q.add("flaky", 0, { attempts: 1 });
    await settle();
    await clock.advance(300);
    const snap = tq.metrics.snapshot("m");
    expect(snap.counters).toEqual({ added: 3, completed: 2, failed: 1, retried: 1, dead: 0, stalled: 0 });
    expect(snap.duration).toEqual({ count: 2, p50: 100, p95: 300, max: 300 });
  });

  it("isolates throwing listeners", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("m");
    tq.events.on("completed", () => {
      throw new Error("dashboard down");
    });
    tq.define("m", "work", () => 1);
    tq.worker("m").start();
    const job = await q.add("work", null);
    await settle();
    expect((await q.getJob(job.id))!.state).toBe("completed");
    expect(tq.metrics.snapshot("m").counters.completed).toBe(1);
  });
});
