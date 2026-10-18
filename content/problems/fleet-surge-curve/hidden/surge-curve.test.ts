import { expect, it } from "testkit";
import { computeSurgeBps } from "../../src/pricing/surge";

it("computes the target curve exactly (from a 1.0x previous)", () => {
  expect(computeSurgeBps(4, 0)).toBe(10_000); // demand below 5
  expect(computeSurgeBps(6, 5)).toBe(10_000); // ratio exactly 1.2
  expect(computeSurgeBps(7, 5)).toBe(11_250); // 1.4 - 1.2 must not become 0.19999...
  expect(computeSurgeBps(11, 8)).toBe(11_000);
  expect(computeSurgeBps(10, 8)).toBe(10_000); // target 10_250 is inside the dead band
});

it("limits each move to 2500 bps and keeps the previous value inside the dead band", () => {
  expect(computeSurgeBps(40, 10, 10_000)).toBe(12_500); // target 27_500
  expect(computeSurgeBps(40, 10, 26_000)).toBe(27_500);
  expect(computeSurgeBps(40, 10, 27_300)).toBe(27_300); // |200| < 500
  expect(computeSurgeBps(40, 10, 27_000)).toBe(27_500); // |500| is not < 500
  expect(computeSurgeBps(0, 10, 20_000)).toBe(17_500); // decays gradually
});

it("handles zero supply, the cap, and a previous value above the cap", () => {
  expect(computeSurgeBps(5, 0, 10_000, 25_000)).toBe(12_500);
  expect(computeSurgeBps(5, 0, 24_000, 25_000)).toBe(25_000);
  expect(computeSurgeBps(100, 1, 29_000)).toBe(30_000);
  expect(computeSurgeBps(0, 0, 40_000)).toBe(27_500); // previous clamped to 30_000 first
});

it("rejects invalid input with RangeError", () => {
  expect(() => computeSurgeBps(-1, 3)).toThrow(RangeError);
  expect(() => computeSurgeBps(5, 1.5)).toThrow(RangeError);
  expect(() => computeSurgeBps(5, 2, 9_000)).toThrow(RangeError);
  expect(() => computeSurgeBps(5, 2, 12_345.5)).toThrow(RangeError);
});
