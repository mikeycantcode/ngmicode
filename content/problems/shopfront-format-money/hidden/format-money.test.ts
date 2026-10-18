import { it, expect } from "testkit";
import { formatCents } from "../../src/shared/money";

it("groups thousands and places the minus sign before $", () => {
  expect(formatCents(100000)).toBe("$1,000.00");
  expect(formatCents(123456789)).toBe("$1,234,567.89");
  expect(formatCents(-123456)).toBe("-$1,234.56");
  expect(formatCents(99999)).toBe("$999.99");
});

it("handles zero, negative zero and sub-dollar amounts", () => {
  expect(formatCents(0)).toBe("$0.00");
  expect(formatCents(-0)).toBe("$0.00");
  expect(formatCents(-5)).toBe("-$0.05");
  expect(formatCents(1250)).toBe("$12.50");
});

it("rejects non-integers with a RangeError", () => {
  for (const bad of [12.5, NaN, Infinity]) {
    expect(() => formatCents(bad)).toThrow(RangeError);
    expect(() => formatCents(bad)).toThrow("cents must be an integer");
  }
});

it("is exact for large values", () => {
  expect(formatCents(100000000000)).toBe("$1,000,000,000.00");
  expect(formatCents(900719925474099)).toBe("$9,007,199,254,740.99");
});
