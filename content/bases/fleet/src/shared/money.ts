/**
 * Money is ALWAYS integer cents (type alias Cents). Multipliers (surge,
 * commission, revenue shares) are ALWAYS integer basis points: 10_000 = 1.0x.
 * Round once, at the end of a calculation step, half-up.
 */
export type Cents = number;
export type Bps = number;

export const ONE_X_BPS: Bps = 10_000;

export function assertCents(value: number, field = "amount"): Cents {
  if (!Number.isInteger(value)) throw new RangeError(`${field} must be integer cents, got ${value}`);
  return value;
}

/** Round half away from zero (so 2.5 -> 3, -2.5 -> -3). */
export function roundHalfUp(x: number): number {
  // Nudge by a tiny epsilon so 1.005 * 100 style artefacts round the intuitive way.
  const r = Math.round(Math.abs(x) + 1e-9);
  return x < 0 ? -r : r;
}

/** cents * bps / 10_000, rounded half-up. */
export function applyBps(cents: Cents, bps: Bps): Cents {
  return roundHalfUp((cents * bps) / ONE_X_BPS);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function formatCents(cents: Cents, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${sign}${symbol}${dollars.toLocaleString("en-US")}.${rest}`;
}

/** Format a bps multiplier for display: 12_500 -> "1.25x". */
export function formatMultiplier(bps: Bps): string {
  return `${(bps / ONE_X_BPS).toFixed(2).replace(/0$/, "")}x`;
}

/**
 * @deprecated floating-point dollars. Only used by the legacy fare path.
 * Use integer cents everywhere else.
 */
export function dollarsToCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}
