/**
 * Deterministic, prefixed, sortable ids: drv_000001, trp_000042, ...
 * Each prefix has its own counter so ids are stable across test runs.
 */
export type IdPrefix = "drv" | "rdr" | "trp" | "pay" | "evt" | "rat" | "prm" | "led";

export class IdGenerator {
  private counters = new Map<string, number>();

  next(prefix: IdPrefix): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(6, "0")}`;
  }

  /** @deprecated use next(prefix). Kept for the v1 import script. */
  legacyNext(): string {
    return this.next("evt");
  }
}
