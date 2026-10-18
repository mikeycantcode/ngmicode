import { it, expect } from "testkit";
import { ValidationError } from "../../src/domain/errors";
import { parseAmount } from "../../src/domain/money";

it("parses grouped and ungrouped amounts using the currency exponent", () => {
  expect(parseAmount(" 1,234.5 ", "USD")).toEqual({ amount: 123450, currency: "USD" });
  expect(parseAmount("1234567.89", "USD").amount).toBe(123456789);
  expect(parseAmount("-7", "KWD").amount).toBe(-7000);
  expect(parseAmount("0.001", "KWD").amount).toBe(1);
  expect(parseAmount("12", "JPY").amount).toBe(12);
  expect(Object.is(parseAmount("-0.00", "USD").amount, 0)).toBe(true);
});

it("rejects malformed input with exact messages", () => {
  for (const bad of ["12,34", "1,2345", ".5", "5.", "+5", "1e3", "", "--1", "1 000"]) {
    expect(() => parseAmount(bad, "USD")).toThrow(`invalid amount: "${bad}"`);
  }
  expect(() => parseAmount(" 1.234", "USD")).toThrow('too many decimal places for USD: " 1.234"');
  expect(() => parseAmount("1.5", "JPY")).toThrow('too many decimal places for JPY: "1.5"');
  expect(() => parseAmount("1.", "JPY")).toThrow('invalid amount: "1."');
  expect(() => parseAmount("1", "XYZ")).toThrow("unsupported currency: XYZ");
  expect(() => parseAmount("1.0", "USD")).not.toThrow();
});

it("is exact up to MAX_SAFE_INTEGER and rejects beyond it", () => {
  expect(parseAmount("90,071,992,547,409.91", "USD").amount).toBe(9007199254740991);
  expect(() => parseAmount("90071992547409.92", "USD")).toThrow(ValidationError);
  expect(() => parseAmount("90071992547409.92", "USD")).toThrow('amount out of range: "90071992547409.92"');
});
