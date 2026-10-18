import { ValidationError } from "./errors";

export interface CurrencyInfo {
  code: string;
  /** Number of minor-unit digits (USD 2 -> cents, JPY 0, KWD 3 -> fils). */
  exponent: number;
  name: string;
}

// ISO 4217 subset we currently settle in. Add new currencies here AND to the
// treasury runbook (ops/treasury.md in the infra repo).
const CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: "USD", exponent: 2, name: "US Dollar" },
  EUR: { code: "EUR", exponent: 2, name: "Euro" },
  GBP: { code: "GBP", exponent: 2, name: "Pound Sterling" },
  CAD: { code: "CAD", exponent: 2, name: "Canadian Dollar" },
  JPY: { code: "JPY", exponent: 0, name: "Japanese Yen" },
  KWD: { code: "KWD", exponent: 3, name: "Kuwaiti Dinar" },
};

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function getCurrency(code: string): CurrencyInfo {
  if (!isSupportedCurrency(code)) throw new ValidationError(`unsupported currency: ${code}`, { currency: code });
  return CURRENCIES[code];
}

/** 10^exponent, e.g. 100 for USD. */
export function minorUnitFactor(code: string): number {
  return 10 ** getCurrency(code).exponent;
}

export function listCurrencies(): CurrencyInfo[] {
  return Object.values(CURRENCIES);
}
