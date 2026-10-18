import { it, expect } from "testkit";
import { createLedgerApp } from "../../src/app";
import { NoRateError } from "../../src/domain/errors";
import { money } from "../../src/domain/money";
import { manualClock } from "../../src/lib/clock";
import { DAY_MS, HOUR_MS } from "../../src/lib/time";

function makeFx() {
  const clock = manualClock();
  const app = createLedgerApp({ clock });
  return { fx: app.services.fx, t0: clock.now() };
}

it("falls back to the inverse pair but prefers a usable direct rate", () => {
  const { fx, t0 } = makeFx();
  fx.setRate("USD", "EUR", "0.8", t0);
  expect(fx.convert(money(1000, "EUR"), "USD", t0).amount).toBe(1250);
  fx.setRate("JPY", "USD", "0.0066", t0);
  expect(fx.convert(money(1000, "USD"), "JPY", t0).amount).toBe(1515); // 10 / 0.0066 = 1515.15
  fx.setRate("EUR", "USD", "1.30", t0);
  fx.setRate("USD", "EUR", "0.5", t0 + HOUR_MS);
  expect(fx.convert(money(1000, "EUR"), "USD", t0 + HOUR_MS).amount).toBe(1300);
});

it("triangulates via USD and rounds once at the end", () => {
  const { fx, t0 } = makeFx();
  fx.setRate("EUR", "USD", "1.0850", t0);
  fx.setRate("USD", "JPY", "150.37", t0);
  // exact: 1.00 EUR * 1.085 * 150.37 = 163.15145 JPY; rounding the USD leg first would give 162
  expect(fx.convert(money(100, "EUR"), "JPY", t0)).toEqual({ amount: 163, currency: "JPY" });
  // both legs inverted: JPY -> USD (1/150.37) -> EUR (1/1.085); 100000 JPY = 612.927... EUR
  expect(fx.convert(money(100000, "JPY"), "EUR", t0).amount).toBe(61293);
  // exact ties round half-even: GBP -> USD -> CAD, 1 GBP-penny = 1.25 * 2 = 2.5 CAD-cents
  fx.setRate("GBP", "USD", "1.25", t0);
  fx.setRate("USD", "CAD", "2", t0);
  expect(fx.convert(money(1, "GBP"), "CAD", t0).amount).toBe(2); // 2.5 -> 2
  expect(fx.convert(money(3, "GBP"), "CAD", t0).amount).toBe(8); // 7.5 -> 8
});

it("treats rates older than 24h as missing, falling back per leg", () => {
  const { fx, t0 } = makeFx();
  fx.setRate("EUR", "USD", "1.10", t0);
  expect(fx.convert(money(1000, "EUR"), "USD", t0 + DAY_MS).amount).toBe(1100);
  expect(() => fx.convert(money(1000, "EUR"), "USD", t0 + DAY_MS + 1)).toThrow(NoRateError);
  fx.setRate("USD", "EUR", "0.5", t0 + DAY_MS);
  expect(fx.convert(money(1000, "EUR"), "USD", t0 + DAY_MS + 1).amount).toBe(2000);
});

it("names the requested pair when nothing resolves", () => {
  const { fx, t0 } = makeFx();
  fx.setRate("EUR", "USD", "1.0850", t0);
  expect(() => fx.convert(money(100, "EUR"), "JPY", t0)).toThrow("no FX rate for EUR->JPY at 2024-01-01T00:00:00.000Z");
  expect(() => fx.convert(money(100, "EUR"), "JPY", t0)).toThrow(NoRateError);
});
