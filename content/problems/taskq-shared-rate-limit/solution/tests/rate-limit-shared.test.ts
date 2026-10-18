import { describe, it, expect } from "testkit";
import { setup, recordStarts } from "./helpers";

describe("rate limit across workers", () => {
  it("shares one budget between every worker on the queue", async () => {
    const { tq, clock, settle } = setup();
    const q = tq.queue("payments", { rateLimit: { max: 5, duration: 1000 } });
    tq.define("payments", "charge", () => {});
    const starts = recordStarts(tq, "payments");
    for (let i = 0; i < 3; i++) tq.worker("payments", { concurrency: 10 }).start();
    for (let i = 0; i < 12; i++) await q.add("charge", i);
    await settle();
    expect(starts).toHaveLength(5);
    await clock.advance(1000);
    expect(starts).toHaveLength(10);
  });
});
