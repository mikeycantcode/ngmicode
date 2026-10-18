import { describe, it, expect } from "testkit";
import { NoRateError } from "../src/domain/errors";
import { add, applyBps, formatMoney, money, negate, toDecimalString } from "../src/domain/money";
import { divRound } from "../src/lib/numeric";
import { HOUR_MS } from "../src/lib/time";
import { setup } from "./helpers";

describe("money", () => {
  it("rejects fractional minor units and unknown currencies", () => {
    expect(() => money(1.5, "USD")).toThrow("integer number of minor units");
    expect(() => money(1, "XXX")).toThrow("unsupported currency: XXX");
  });

  it("refuses to add different currencies", () => {
    expect(() => add(money(1, "USD"), money(1, "EUR"))).toThrow("currency mismatch");
    expect(add(money(150, "USD"), money(-50, "USD")).amount).toBe(100);
  });

  it("formats using the currency exponent", () => {
    expect(toDecimalString(money(123456, "USD"))).toBe("1234.56");
    expect(toDecimalString(money(5, "USD"))).toBe("0.05");
    expect(toDecimalString(money(-5, "JPY"))).toBe("-5");
    expect(toDecimalString(money(1250, "KWD"))).toBe("1.250");
    expect(formatMoney(money(-123456789, "USD"))).toBe("-1,234,567.89 USD");
  });

  it("never produces negative zero", () => {
    expect(Object.is(negate(money(0, "USD")).amount, 0)).toBe(true);
  });

  it("computes fees with banker's rounding", () => {
    expect(applyBps(money(10000, "USD"), 250).amount).toBe(250);
    expect(applyBps(money(20, "USD"), 250).amount).toBe(0); // 0.5 -> 0 (even)
    expect(applyBps(money(60, "USD"), 250).amount).toBe(2); // 1.5 -> 2
  });
});

describe("divRound", () => {
  it("supports every mode for negatives", () => {
    expect(divRound(-5n, 2n, "half-even")).toBe(-2n);
    expect(divRound(-7n, 2n, "half-even")).toBe(-4n);
    expect(divRound(-5n, 2n, "half-up")).toBe(-3n);
    expect(divRound(-5n, 2n, "floor")).toBe(-3n);
    expect(divRound(-5n, 2n, "ceil")).toBe(-2n);
    expect(divRound(-5n, 2n, "trunc")).toBe(-2n);
  });
});

describe("fx", () => {
  it("converts with the latest rate effective at the given time", () => {
    const { services, clock } = setup();
    const t0 = clock.now();
    services.fx.setRate("EUR", "USD", "1.10", t0);
    services.fx.setRate("EUR", "USD", "1.20", t0 + HOUR_MS);
    expect(services.fx.convert(money(1000, "EUR"), "USD", t0).amount).toBe(1100);
    expect(services.fx.convert(money(1000, "EUR"), "USD", t0 + HOUR_MS).amount).toBe(1200);
  });

  it("handles currency exponents and rounds half-even", () => {
    const { services } = setup();
    services.fx.setRate("USD", "JPY", "150.5");
    services.fx.setRate("USD", "KWD", "0.3075");
    expect(services.fx.convert(money(100, "USD"), "JPY").amount).toBe(150); // 150.5 -> 150
    expect(services.fx.convert(money(300, "USD"), "JPY").amount).toBe(452); // 451.5 -> 452
    expect(services.fx.convert(money(1000, "USD"), "KWD").amount).toBe(3075);
  });

  it("throws NoRateError for a missing pair", () => {
    const { services } = setup();
    expect(() => services.fx.convert(money(1, "GBP"), "CAD")).toThrow(NoRateError);
  });
});
