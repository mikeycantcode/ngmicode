import { it, expect } from "testkit";
import { allocate } from "../../src/domain/allocation";
import { money } from "../../src/domain/money";

const amounts = (xs: { amount: number }[]) => xs.map((m) => m.amount);

it("uses largest remainder with lower-index tie-breaks", () => {
  expect(amounts(allocate(money(100, "USD"), [1, 1, 1]))).toEqual([34, 33, 33]);
  expect(amounts(allocate(money(5, "USD"), [3, 7]))).toEqual([2, 3]);
  // remainders: 10*1/6=1.67, 10*2/6=3.33, 10*3/6=5 -> leftover 1 goes to index 0
  expect(amounts(allocate(money(10, "USD"), [1, 2, 3]))).toEqual([2, 3, 5]);
  // zero weight never receives a unit; tie between index 1 and 2 -> index 1
  expect(amounts(allocate(money(3, "USD"), [0, 1, 1]))).toEqual([0, 2, 1]);
  const parts = allocate(money(7, "JPY"), [2, 0, 5]);
  expect(parts.every((p) => p.currency === "JPY")).toBe(true);
  expect(amounts(parts)).toEqual([2, 0, 5]);
});

it("negates the allocation of |total| for negative totals", () => {
  const parts = amounts(allocate(money(-100, "USD"), [1, 1, 1, 0]));
  expect(parts.slice(0, 3)).toEqual([-34, -33, -33]);
  expect(Object.is(parts[3], 0)).toBe(true);
});

it("is exact near MAX_SAFE_INTEGER and validates weights", () => {
  const big = Number.MAX_SAFE_INTEGER; // 9007199254740991
  expect(amounts(allocate(money(big, "USD"), [1, 1, 1]))).toEqual([3002399751580331, 3002399751580330, 3002399751580330]);
  const parts = amounts(allocate(money(big, "USD"), [big, 1]));
  expect(parts[0] + parts[1]).toBe(big);
  expect(parts).toEqual([9007199254740990, 1]);
  const msg = "weights must be non-negative integers with a positive sum";
  expect(() => allocate(money(1, "USD"), [])).toThrow(RangeError);
  expect(() => allocate(money(1, "USD"), [0, 0])).toThrow(msg);
  expect(() => allocate(money(1, "USD"), [1, -1, 2])).toThrow(msg);
  expect(() => allocate(money(1, "USD"), [1.5])).toThrow(msg);
});
