export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function clamp(x: number, lo: number, hi: number): number {
  if (lo > hi) throw new RangeError("lo > hi");
  return Math.min(hi, Math.max(lo, x));
}
