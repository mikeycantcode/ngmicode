// Deterministic, prefix-scoped id generator. Tests rely on stable ids, so never
// use Math.random() for identifiers.
export interface IdGenerator {
  next(prefix: string): string;
}

export function createIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix: string) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}_${String(n).padStart(4, "0")}`;
    },
  };
}
