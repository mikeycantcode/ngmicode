import { describe, it, expect } from "testkit";
import { setup, record } from "./helpers";
import { deferred } from "../src/utils/async";

describe("Scheduler", () => {
  it("promotes delayed jobs exactly when due", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("later");
    const ran: number[] = [];
    tq.define("later", "ping", () => {
      ran.push(clock.now());
    });
    tq.worker("later").start();
    tq.scheduler.start();
    const t0 = clock.now();
    await q.add("ping", null, { delay: 1500 });
    await settle();
    await clock.advance(1499);
    expect(ran).toEqual([]);
    await clock.advance(1);
    expect(ran).toEqual([t0 + 1500]);
  });

  it("runs `every` repeatables and skips missed runs", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("cron");
    let n = 0;
    tq.define("cron", "tick", () => {
      n++;
    });
    tq.worker("cron").start();
    tq.scheduler.start();
    q.repeat("tick", null, { every: 1000 });
    await settle();
    await clock.advance(3000);
    expect(n).toBe(3);
    clock.jump(10_000); // process frozen
    await clock.advance(0);
    expect(n).toBe(4);
  });

  it("runs cron repeatables at matching minutes", async () => {
    const { tq, clock, settle } = setup({}, Date.UTC(2024, 0, 1, 10, 7));
    const q = tq.queue("cron");
    const at: string[] = [];
    tq.define("cron", "report", () => {
      at.push(new Date(clock.now()).toISOString().slice(11, 16));
    });
    tq.worker("cron").start();
    tq.scheduler.start();
    q.repeat("report", null, { cron: "*/15 * * * *", limit: 3 });
    await settle();
    await clock.advance(60 * 60_000);
    expect(at).toEqual(["10:15", "10:30", "10:45"]);
  });

  it("recovers stalled jobs whose lock expired", async () => {
    const { tq, clock, settle } = setup({ scheduler: { stalledInterval: 5000 } });
    const q = tq.queue("work");
    const gate = deferred();
    let calls = 0;
    tq.define("work", "x", async () => {
      calls++;
      if (calls === 1) await gate.promise; // first run hangs
      return calls;
    });
    const events = record(tq, "stalled", "completed", "lock:lost");
    tq.worker("work", { lockDuration: 1000, concurrency: 2 }).start();
    tq.scheduler.start();
    const job = await q.add("x", null);
    await settle();
    clock.jump(2000); // worker froze: lock expired without renewal
    await tq.scheduler.tick();
    await settle();
    expect(calls).toBe(2);
    gate.resolve(); // the frozen run finally returns
    await clock.advance(0);
    expect(events.map((e) => e.name)).toEqual(["stalled", "completed", "lock:lost"]);
    expect((await q.getJob(job.id))!.returnValue).toBe(2);
  });
});
