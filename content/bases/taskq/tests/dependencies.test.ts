import { describe, it, expect } from "testkit";
import { setup } from "./helpers";
import { CycleError } from "../src/core/errors";

describe("job dependencies", () => {
  it("runs a flow in dependency order", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("etl");
    const order: string[] = [];
    tq.define("etl", "*", (ctx) => {
      order.push(ctx.job.name);
    });
    tq.worker("etl", { concurrency: 4 }).start();
    const ids = await q.addFlow([
      { key: "load", name: "load", data: null, dependsOn: ["clean-a", "clean-b"] },
      { key: "clean-a", name: "clean-a", data: null, dependsOn: ["extract"] },
      { key: "clean-b", name: "clean-b", data: null, dependsOn: ["extract"] },
      { key: "extract", name: "extract", data: null },
    ]);
    await settle();
    expect(order[0]).toBe("extract");
    expect(order[3]).toBe("load");
    expect((await q.getJob(ids.load))!.state).toBe("completed");
  });

  it("blocks until parents complete", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("etl");
    const parent = await q.add("p", null);
    const child = await q.add("c", null, { dependsOn: [parent.id] });
    expect(child.state).toBe("blocked");
    tq.define("etl", "*", () => {});
    tq.worker("etl").start();
    await settle();
    expect((await q.getJob(child.id))!.state).toBe("completed");
  });

  it("fails descendants when a parent fails", async () => {
    const { tq, settle } = setup();
    const q = tq.queue("etl");
    tq.define("etl", "boom", () => {
      throw new Error("bad input");
    });
    tq.define("etl", "ok", () => {});
    const a = await q.add("boom", null);
    const b = await q.add("ok", null, { dependsOn: [a.id] });
    const c = await q.add("ok", null, { dependsOn: [b.id] });
    tq.worker("etl").start();
    await settle();
    expect((await q.getJob(b.id))!.failedReason).toBe(`parent ${a.id} failed`);
    expect((await q.getJob(c.id))!.state).toBe("failed");
  });

  it("rejects cyclic flows", async () => {
    const { tq } = setup();
    const q = tq.queue("etl");
    await expect(
      q.addFlow([
        { key: "a", name: "a", data: null, dependsOn: ["c"] },
        { key: "b", name: "b", data: null, dependsOn: ["a"] },
        { key: "c", name: "c", data: null, dependsOn: ["b"] },
      ]),
    ).rejects.toThrow(CycleError);
    expect((await q.getCounts()).blocked).toBe(0);
  });
});
