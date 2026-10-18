import { Money, money } from "./money";

const WEIGHTS_ERROR = "weights must be non-negative integers with a positive sum";

/**
 * Splits `total` across `weights` using the largest remainder method.
 * Parts sum to total exactly; ties go to the lower index; negative totals are
 * allocated on |total| and negated.
 */
export function allocate(total: Money, weights: number[]): Money[] {
  if (!Array.isArray(weights) || weights.length === 0) throw new RangeError(WEIGHTS_ERROR);
  for (const w of weights) if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(WEIGHTS_ERROR);
  const W = weights.reduce((s, w) => s + BigInt(w), 0n);
  if (W === 0n) throw new RangeError(WEIGHTS_ERROR);

  const negative = total.amount < 0;
  const A = BigInt(Math.abs(total.amount));
  const shares = weights.map((w) => (A * BigInt(w)) / W);
  const remainders = weights.map((w) => (A * BigInt(w)) % W);
  let leftover = A - shares.reduce((s, q) => s + q, 0n);

  const order = weights
    .map((_, i) => i)
    .sort((a, b) => (remainders[a] === remainders[b] ? a - b : remainders[a] > remainders[b] ? -1 : 1));
  for (const i of order) {
    if (leftover === 0n) break;
    shares[i] += 1n;
    leftover -= 1n;
  }
  return shares.map((q) => money(negative ? -Number(q) : Number(q), total.currency));
}
