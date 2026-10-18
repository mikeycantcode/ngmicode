import { ValidationError } from "../domain/errors";

/**
 * Exact integer rounding on bigints. All money math that can produce a
 * fraction (fees, FX) goes through here so we never round a float.
 *
 * Modes:
 *  - "half-even": banker's rounding (default for money)
 *  - "half-up":   half away from zero
 *  - "floor" / "ceil": toward -inf / +inf
 *  - "trunc":     toward zero
 */
export type RoundingMode = "half-even" | "half-up" | "floor" | "ceil" | "trunc";

export function divRound(num: bigint, den: bigint, mode: RoundingMode = "half-even"): bigint {
  if (den === 0n) throw new RangeError("division by zero");
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const q = num / den; // truncates toward zero
  const r = num % den; // same sign as num
  if (r === 0n) return q;
  const negative = num < 0n;
  const away = negative ? q - 1n : q + 1n;
  const twice = 2n * (negative ? -r : r);
  switch (mode) {
    case "trunc":
      return q;
    case "floor":
      return negative ? q - 1n : q;
    case "ceil":
      return negative ? q : q + 1n;
    case "half-up":
      return twice >= den ? away : q;
    case "half-even":
      if (twice > den) return away;
      if (twice < den) return q;
      return q % 2n === 0n ? q : away;
  }
}

/** Rounds a JS number using the same modes. Only safe for |x| < 2^53. */
export function roundNumber(x: number, mode: RoundingMode = "half-even"): number {
  // Scale by 1e9 to get a usable fraction without float drift in common cases.
  // NOTE: prefer divRound with exact integers; this exists for display code.
  const scaled = BigInt(Math.round(x * 1e9));
  return Number(divRound(scaled, 1_000_000_000n, mode));
}


/** A non-negative decimal as an exact integer + scale: 1.0845 -> { units: 10845n, scale: 4 }. */
export interface Decimal {
  units: bigint;
  scale: number;
}

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

export function parseDecimal(input: string): Decimal {
  const m = typeof input === "string" ? DECIMAL_RE.exec(input.trim()) : null;
  if (!m) throw new ValidationError(`invalid decimal: ${String(input)}`);
  const frac = m[2] ?? "";
  return { units: BigInt(m[1] + frac), scale: frac.length };
}

export function decimalToString(d: Decimal): string {
  if (d.scale === 0) return d.units.toString();
  const s = d.units.toString().padStart(d.scale + 1, "0");
  return `${s.slice(0, -d.scale)}.${s.slice(-d.scale)}`;
}

export function isZeroDecimal(d: Decimal): boolean {
  return d.units === 0n;
}

/** Denominator for the decimal, i.e. 10^scale. */
export function decimalDenominator(d: Decimal): bigint {
  return 10n ** BigInt(d.scale);
}
