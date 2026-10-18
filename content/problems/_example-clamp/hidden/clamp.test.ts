import { it, expect } from "testkit";
import { clamp } from "../../src/math";

it("clamps", () => {
  expect(clamp(5, 0, 3)).toBe(3);
  expect(clamp(-1, 0, 3)).toBe(0);
});
it("rejects inverted range", async () => {
  expect(() => clamp(1, 3, 0)).toThrow(RangeError);
  await expect(Promise.reject(new Error("x"))).rejects.toThrow("x");
});
