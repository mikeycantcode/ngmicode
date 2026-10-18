import { describe, it, expect } from "testkit";
import { sum } from "../src/math";

describe("sum", () => {
  it("adds", () => expect(sum([1, 2, 3])).toBe(6));
});
