import { describe, expect, test } from "vitest";
import { pipe } from "../../src/pipe";
import { range } from "../../src/range";

// From remeda/remeda#1257.
describe("range with a step", () => {
  test("positive step (data-first and data-last)", () => {
    expect(range(1, { end: 20, step: 5 })).toStrictEqual([1, 6, 11, 16]);
    expect(range(0, { end: 10, step: 5 })).toStrictEqual([0, 5]);
    expect(range(1, { end: 5, step: 100 })).toStrictEqual([1]);
    expect(pipe(1, range({ end: 20, step: 5 }))).toStrictEqual([1, 6, 11, 16]);
  });

  test("negative step, and a step in the wrong direction", () => {
    expect(range(20, { end: 1, step: -5 })).toStrictEqual([20, 15, 10, 5]);
    expect(range(21, { end: 10, step: -3 })).toStrictEqual([21, 18, 15, 12]);
    expect(range(1, { end: 20, step: -5 })).toStrictEqual([]);
  });

  test("step 0 throws a RangeError", () => {
    expect(() => range(0, { end: 5, step: 0 })).toThrow(RangeError);
  });

  test("floating-point inputs", () => {
    expect(range(1, { end: 5, step: 0.5 })).toStrictEqual([
      1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5,
    ]);
    expect(range(0, { end: 3, step: 0.1 })).toHaveLength(30);
    expect(range(0, 1e-13)).toStrictEqual([0]);
    expect(range(1, 5.5)).toStrictEqual([1, 2, 3, 4, 5]);
  });

  test("should support `start` of `-0`", () => {
    expect(1 / range(-0, 1)[0]!).toBe(-Infinity);
  });
});
