// Money helpers. ALL monetary amounts in shopfront are integer cents (type Cents).
// Never store or pass floating-point dollars between modules — see shared/legacy.ts
// for the old helpers we are migrating away from.

export type Cents = number;

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isInteger(value);
}

export function assertCents(value: unknown, label = "amount"): asserts value is Cents {
  if (!isCents(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${String(value)}`);
  }
}

export function addCents(...amounts: Cents[]): Cents {
  let total = 0;
  for (const a of amounts) total += a;
  return total;
}

export function sumCents<T>(items: readonly T[], pick: (item: T) => Cents): Cents {
  let total = 0;
  for (const item of items) total += pick(item);
  return total;
}

export function multiplyCents(unitCents: Cents, quantity: number): Cents {
  return unitCents * quantity;
}

/**
 * percent% of an amount, rounded half-up to the nearest cent.
 * percentOf(999, 10) === 100 (99.9 rounds up).
 */
export function percentOf(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100);
}

/** Basis points (1/100 of a percent), rounded half-up. 725 bps = 7.25%. */
export function bpsOf(cents: Cents, bps: number): Cents {
  return Math.round((cents * bps) / 10_000);
}

export function clampCents(value: Cents, min: Cents, max: Cents): Cents {
  return Math.min(max, Math.max(min, value));
}

/**
 * Human-readable USD amount for labels and emails.
 * TODO(#231): thousands separators + negative amounts — finance wants "-$1,234.50".
 */
export function formatCents(cents: Cents): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// TODO(#318): proportional split of order-level discounts across lines (needed for
// refunds). Until then, splitEvenly is the only splitting helper we have.
export function splitEvenly(total: Cents, parts: number): Cents[] {
  if (parts <= 0) throw new RangeError("parts must be positive");
  const base = Math.floor(total / parts);
  const out = new Array<Cents>(parts).fill(base);
  let remainder = total - base * parts;
  for (let i = 0; remainder > 0; i++, remainder--) out[i] += 1;
  return out;
}
