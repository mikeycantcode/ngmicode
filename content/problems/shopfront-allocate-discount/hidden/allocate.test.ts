import { it, expect } from "testkit";
import { allocateCents } from "../../src/shared/money";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

it("hands leftover cents to the largest remainders, ties to the lower index", () => {
  expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
  expect(allocateCents(10, [5, 1, 1])).toEqual([7, 2, 1]);
  expect(allocateCents(1, [1, 1])).toEqual([1, 0]);
  expect(allocateCents(100, [3, 3, 1])).toEqual([43, 43, 14]);
  const weights = [1999, 2999, 4999, 1];
  const copy = [...weights];
  const big = allocateCents(999_999_99, weights);
  expect(sum(big)).toBe(999_999_99);
  expect(weights).toEqual(copy);
});

it("never gives cents to zero weights", () => {
  expect(allocateCents(5, [0, 2, 0, 3])).toEqual([0, 2, 0, 3]);
  expect(allocateCents(7, [0, 1, 1, 0])).toEqual([0, 4, 3, 0]);
  expect(allocateCents(0, [0, 0])).toEqual([0, 0]);
});

it("validates input in the specified order with exact messages", () => {
  expect(() => allocateCents(-1, [])).toThrow("total must be a non-negative integer");
  expect(() => allocateCents(1.5, [1])).toThrow(RangeError);
  expect(() => allocateCents(10, [])).toThrow("weights must not be empty");
  expect(() => allocateCents(10, [1, -1])).toThrow("weights must be non-negative integers");
  expect(() => allocateCents(10, [1, 0.5])).toThrow("weights must be non-negative integers");
  expect(() => allocateCents(5, [0, 0])).toThrow("cannot allocate a positive total across zero weights");
  expect(() => allocateCents(5, [0, 0])).toThrow(RangeError);
});
