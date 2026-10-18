export function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

export function sortedKeys<T>(record: Record<string, T>): string[] {
  return Object.keys(record).sort();
}

export function groupBy<T, K extends string>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}

/** Plain-object deep merge: arrays and primitives from `b` replace those in `a`. */
export function deepMerge<T>(a: T, b: unknown): T {
  if (b === undefined) return a;
  if (!isPlainObject(a) || !isPlainObject(b)) return b as T;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Compares strings by UTF-16 code unit, independent of locale. */
export function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
