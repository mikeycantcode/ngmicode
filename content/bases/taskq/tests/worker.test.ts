import { describe, it, expect } from "testkit";
import { setup, record } from "./helpers";
import { deferred, type Deferred } from "../src/utils/async";

describe("Worker", () => {
  it("processes jobs by priority, FIFO within a priority", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("reports");
    const order: string[] = [];
    tq.define("reports", "build", async (ctx) => {
      order.push(ctx.data as string);
    });
    await q.add("build", "low-1", { priority: 5 });
    await q.add("build", "high-1", { priority: 1 });
    await q.add("build", "low-2", { priority: 5 });
    await q.add("build", "high-2", { priority: 1 });
    await q.add("build", "default", {});
    tq.worker("reports").start();
    await settle();
    expect(order).toEqual(["default", "high-1", "high-2", "low-1", "low-2"]);
  });

  it("never exceeds its concurrency", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("img");
    const gates: Deferred<void>[] = [];
    let running = 0;
    let peak = 0;
    tq.define("img", "resize", async () => {
      running++;
      peak = Math.max(peak, running);
      const g = deferred();
      gates.push(g);
      await g.promise;
      running--;
    });
    tq.worker("img", { concurrency: 3 }).start();
    for (let i = 0; i < 8; i++) await q.add("resize", i);
    await settle();
    expect(running).toBe(3);
    while (gates.length) {
      gates.shift()!.resolve();
      await settle();
    }
    expect(peak).toBe(3);
    expect((await q.getCounts()).completed).toBe(8);
  });

  it("emits lifecycle events and stores the return value", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("math");
    const events = record(tq, "active", "completed", "drained");
    tq.define("math", "double", async (ctx) => (ctx.data as number) * 2);
    tq.worker("math", { id: "w1" }).start();
    const job = await q.add("double", 21);
    await settle();
    expect(events.map((e) => e.name)).toEqual(["active", "completed", "drained"]);
    expect((await q.getJob(job.id))!.returnValue).toBe(42);
  });

  it("fails jobs with no handler without retrying", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("misc");
    tq.worker("misc").start();
    const job = await q.add("mystery", null, { attempts: 3 });
    await settle();
    const stored = (await q.getJob(job.id))!;
    expect(stored.state).toBe("failed");
    expect(stored.attemptsMade).toBe(1);
    expect(stored.failedReason).toMatch("no handler");
  });

  it("times out slow handlers and cancels their signal", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("slow");
    let aborted = false;
    tq.define("slow", "crawl", async (ctx) => {
      ctx.signal.onAbort(() => (aborted = true));
      await ctx.sleep(10_000);
    });
    tq.worker("slow").start();
    const job = await q.add("crawl", null, { timeout: 1000 });
    await settle();
    await clock.advance(1000);
    const stored = (await q.getJob(job.id))!;
    expect(stored.state).toBe("failed");
    expect(stored.failedReason).toMatch("timed out");
    expect(aborted).toBe(true);
  });

  it("respects pause/resume", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("p");
    let n = 0;
    tq.define("p", "x", () => {
      n++;
    });
    tq.worker("p").start();
    q.pause();
    await q.add("x", 1);
    await settle();
    expect(n).toBe(0);
    q.resume();
    await settle();
    expect(n).toBe(1);
  });
});

describe("rate limiting", () => {
  it("limits job starts per window", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("api", { rateLimit: { max: 2, duration: 1000 } });
    const starts: number[] = [];
    tq.define("api", "call", () => {
      starts.push(clock.now());
    });
    tq.worker("api", { concurrency: 5 }).start();
    for (let i = 0; i < 5; i++) await q.add("call", i);
    await settle();
    expect(starts).toHaveLength(2);
    await clock.advance(1000);
    expect(starts).toHaveLength(4);
    await clock.advance(1000);
    expect(starts).toHaveLength(5);
  });
});
