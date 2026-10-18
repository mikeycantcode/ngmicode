import { getCurrency, minorUnitFactor } from "./currency";
import { ValidationError } from "./errors";
import { divRound, RoundingMode } from "../lib/numeric";

/**
 * Money is ALWAYS an integer number of minor units (cents, yen, fils) plus an
 * ISO currency code. Never store or pass around decimal floats.
 */
export interface Money {
  readonly amount: number;
  readonly currency: string;
}

export function money(amount: number, currency: string): Money {
  getCurrency(currency);
  if (!Number.isSafeInteger(amount)) {
    throw new ValidationError(`amount must be an integer number of minor units, got ${amount}`);
  }
  // normalise -0 so equality checks and JSON stay boring
  return Object.freeze({ amount: amount === 0 ? 0 : amount, currency });
}

export function zero(currency: string): Money {
  return money(0, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new ValidationError(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amount, a.currency);
}

export function abs(a: Money): Money {
  return money(Math.abs(a.amount), a.currency);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

export const isZero = (a: Money) => a.amount === 0;
export const isPositive = (a: Money) => a.amount > 0;
export const isNegative = (a: Money) => a.amount < 0;

export function sumMoney(items: Money[], currency: string): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

/** amount * bps / 10_000, rounded exactly. Used for processing fees. */
export function applyBps(m: Money, bps: number, mode: RoundingMode = "half-even"): Money {
  if (!Number.isInteger(bps) || bps < 0) throw new ValidationError(`bps must be a non-negative integer, got ${bps}`);
  return money(Number(divRound(BigInt(m.amount) * BigInt(bps), 10_000n, mode)), m.currency);
}

/** "1234.56" for USD 123456, "-5" for JPY -5, "1.250" for KWD 1250. */
export function toDecimalString(m: Money): string {
  const exp = getCurrency(m.currency).exponent;
  const sign = m.amount < 0 ? "-" : "";
  const digits = String(Math.abs(m.amount));
  if (exp === 0) return sign + digits;
  const padded = digits.padStart(exp + 1, "0");
  return `${sign}${padded.slice(0, -exp)}.${padded.slice(-exp)}`;
}

/** Human display: "1,234.56 USD". Not for machine consumption. */
export function formatMoney(m: Money): string {
  const [whole, frac] = toDecimalString(m).replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${m.amount < 0 ? "-" : ""}${grouped}${frac !== undefined ? "." + frac : ""} ${m.currency}`;
}

/**
 * @deprecated Float-based conversion, kept only for the legacy CSV importer
 * (see legacy/csvImport.ts). 1.005 * 100 is 100.49999999999999 — do not use
 * for anything new. TODO: replace with a string parser.
 */
export function fromDecimal(value: number, currency: string): Money {
  return money(Math.round(value * minorUnitFactor(currency)), currency);
}
