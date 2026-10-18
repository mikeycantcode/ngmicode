import { it, expect } from "testkit";
import { computeBackoff } from "../../src/utils/backoff";

function countingRng(values: number[]) {
  let calls = 0;
  const rng = () => values[calls++ % values.length];
  return { rng, calls: () => calls };
}

it("computes fixed / exponential / capped delays, rounded to nearest ms", () => {
  const { rng } = countingRng([0.5]);
  expect(computeBackoff(1, undefined, rng)).toBe(0);
  expect(computeBackoff(4, 250, rng)).toBe(250);
  expect(computeBackoff(3, { type: "fixed", delay: 400 }, rng)).toBe(400);
  expect(computeBackoff(1, { type: "exponential", delay: 300 }, rng)).toBe(300);
  expect(computeBackoff(5, { type: "exponential", delay: 300 }, rng)).toBe(4800);
  expect(computeBackoff(5, { type: "exponential", delay: 300, maxDelay: 1000 }, rng)).toBe(1000);
  // 101 * (1 - 0.5 * 0.5) = 75.75 -> 76 (round, not floor)
  expect(computeBackoff(1, { type: "fixed", delay: 101, jitter: 0.5 }, rng)).toBe(76);
  // 333 * (1 - 0.5 * 0.5) = 249.75 -> 250
  expect(computeBackoff(2, { type: "fixed", delay: 333, jitter: 0.5 }, rng)).toBe(250);
});

it("caps before applying jitter, and consumes the rng exactly once only when jitter > 0", () => {
  const r = countingRng([0.5, 0.25]);
  // 300 * 2^5 = 9600 -> cap 5000 -> * (1 - 0.2 * 0.5) = 4500
  expect(computeBackoff(6, { type: "exponential", delay: 300, maxDelay: 5000, jitter: 0.2 }, r.rng)).toBe(4500);
  expect(r.calls()).toBe(1);
  computeBackoff(2, { type: "exponential", delay: 300, jitter: 0 }, r.rng);
  computeBackoff(2, { type: "exponential", delay: 300 }, r.rng);
  computeBackoff(2, 300, r.rng);
  computeBackoff(2, undefined, r.rng);
  expect(r.calls()).toBe(1);
  // second value of the sequence is used next: 1000 * (1 - 1 * 0.25) = 750
  expect(computeBackoff(1, { type: "fixed", delay: 1000, jitter: 1 }, r.rng)).toBe(750);
  expect(r.calls()).toBe(2);
});

it("rejects invalid input with the specified RangeErrors", () => {
  const rng = () => 0.5;
  expect(() => computeBackoff(0, 100, rng)).toThrow("attempt must be a positive integer");
  expect(() => computeBackoff(1.5, 100, rng)).toThrow(RangeError);
  expect(() => computeBackoff(0, undefined, rng)).toThrow("attempt must be a positive integer");
  expect(() => computeBackoff(1, -5, rng)).toThrow("backoff delay must be a non-negative number");
  expect(() => computeBackoff(1, { type: "fixed", delay: 10, jitter: 1.5 }, rng)).toThrow("jitter must be between 0 and 1");
  expect(() => computeBackoff(1, { type: "linear" as any, delay: 10 }, rng)).toThrow("unknown backoff type: linear");
});
