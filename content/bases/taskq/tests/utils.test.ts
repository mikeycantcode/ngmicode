import { describe, it, expect } from "testkit";
import { FakeClock } from "../src/clock/fake-clock";
import { BinaryHeap } from "../src/utils/heap";
import { computeBackoff } from "../src/utils/backoff";
import { createRng } from "../src/utils/rng";
import { parseDuration, formatDuration } from "../src/utils/duration";
import { RateLimiter } from "../src/queue/rate-limiter";

describe("FakeClock", () => {
  it("fires timers in due order, then creation order", async () => {
    const c = new FakeClock(0);
    const seen: string[] = [];
    c.setTimeout(() => seen.push("b"), 20);
    c.setTimeout(() => seen.push("a"), 10);
    c.setTimeout(() => seen.push("b2"), 20);
    const h = c.setTimeout(() => seen.push("never"), 15);
    c.clearTimeout(h);
    await c.advance(19);
    expect(seen).toEqual(["a"]);
    expect(c.now()).toBe(19);
    await c.advance(1);
    expect(seen).toEqual(["a", "b", "b2"]);
  });

  it("jump moves time without firing", async () => {
    const c = new FakeClock(0);
    let fired = false;
    c.setTimeout(() => (fired = true), 5);
    c.jump(100);
    expect(fired).toBe(false);
    await c.advance(0);
    expect(fired).toBe(true);
  });
});

describe("BinaryHeap", () => {
  it("pops in compare order", () => {
    const h = new BinaryHeap<number>((a, b) => a - b);
    for (const n of [5, 3, 9, 1, 7, 2, 8]) h.push(n);
    const out: number[] = [];
    while (h.size) out.push(h.pop()!);
    expect(out).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });
});

describe("computeBackoff", () => {
  const rng = () => 0.5;
  it("fixed and exponential", () => {
    expect(computeBackoff(3, 100, rng)).toBe(100);
    expect(computeBackoff(1, { type: "exponential", delay: 100 }, rng)).toBe(100);
    expect(computeBackoff(4, { type: "exponential", delay: 100 }, rng)).toBe(800);
    expect(computeBackoff(10, { type: "exponential", delay: 100, maxDelay: 5000 }, rng)).toBe(5000);
  });
  it("jitter only shortens", () => {
    expect(computeBackoff(1, { type: "fixed", delay: 1000, jitter: 0.5 }, rng)).toBe(750);
    const seeded = createRng(7);
    for (let i = 0; i < 20; i++) {
      const v = computeBackoff(2, { type: "exponential", delay: 1000, jitter: 1 }, seeded);
      expect(v).toBeLessThanOrEqual(2000);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("duration", () => {
  it("parses and formats", () => {
    expect(parseDuration("1.5s")).toBe(1500);
    expect(parseDuration("2m")).toBe(120_000);
    expect(parseDuration(250)).toBe(250);
    expect(() => parseDuration("soon")).toThrow(RangeError);
    expect(formatDuration(90_500)).toBe("1m30.5s");
  });
});

describe("RateLimiter", () => {
  it("is a sliding window", () => {
    const rl = new RateLimiter({ max: 2, duration: 1000 });
    expect(rl.tryAcquire(0)).toBe(true);
    expect(rl.tryAcquire(400)).toBe(true);
    expect(rl.tryAcquire(500)).toBe(false);
    expect(rl.msUntilAvailable(500)).toBe(500);
    expect(rl.tryAcquire(1000)).toBe(true);
    expect(rl.tryAcquire(1000)).toBe(false);
  });
});
