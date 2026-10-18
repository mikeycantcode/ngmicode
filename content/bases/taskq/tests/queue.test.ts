import { describe, it, expect } from "testkit";
import { setup, record } from "./helpers";
import { InvalidJobOptionsError } from "../src/core/errors";

describe("Queue", () => {
  it("adds waiting and delayed jobs", async () => {
    const { tq, clock } = setup();
    const q = tq.queue("emails");
    const a = await q.add("welcome", { to: "a@x.io" });
    const b = await q.add("welcome", { to: "b@x.io" }, { delay: 5000 });
    expect(a.state).toBe("waiting");
    expect(b.state).toBe("delayed");
    expect(b.processAt).toBe(clock.now() + 5000);
    const counts = await q.getCounts();
    expect(counts.waiting).toBe(1);
    expect(counts.delayed).toBe(1);
  });

  it("dedupes on jobId", async () => {
    const { tq } = setup();
    const q = tq.queue("emails");
    const events = record(tq, "added");
    const [a, b] = await Promise.all([q.add("x", 1, { jobId: "order-1" }), q.add("x", 2, { jobId: "order-1" })]);
    expect(a.id).toBe("order-1");
    expect(b.id).toBe("order-1");
    expect(b.data).toBe(1);
    expect(events).toHaveLength(1);
  });

  it("validates options", async () => {
    const { tq } = setup();
    const q = tq.queue("emails");
    await expect(q.add("x", 1, { attempts: 0 })).rejects.toThrow(InvalidJobOptionsError);
    await expect(q.add("x", 1, { priority: 1.5 })).rejects.toThrow("priority");
  });

  it("removes non-active jobs", async () => {
    const { tq } = setup();
    const q = tq.queue("emails");
    const job = await q.add("x", 1, { delay: 100 });
    expect(await q.remove(job.id)).toBe(true);
    expect(await q.getJob(job.id)).toBeUndefined();
    expect((await q.getCounts()).delayed).toBe(0);
  });
});
