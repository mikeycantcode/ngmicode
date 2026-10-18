// maxmemory enforcement. The dispatcher calls ensureBudget() before every
// command flagged "denyoom" (i.e. before it can grow memory), like Redis's
// performEvictions(). A single command may still push usage over the limit;
// the next denyoom command evicts it back down.

import type { Config } from "../config";
import type { Keyspace } from "./keyspace";

export type EvictionPolicy = "noeviction" | "allkeys-lru" | "volatile-lru";

export const EVICTION_POLICIES: EvictionPolicy[] = ["noeviction", "allkeys-lru", "volatile-lru"];

export class Evictor {
  constructor(
    private ks: Keyspace,
    private config: Config,
  ) {}

  /**
   * Evicts keys until usedMemory <= maxmemory. Returns false when the budget
   * cannot be met (noeviction, or nothing evictable left) — the caller must
   * then reject the command with OOM.
   */
  ensureBudget(): boolean {
    const max = this.config.getNumber("maxmemory");
    if (max <= 0) return true;
    const policy = this.config.get("maxmemory-policy") as EvictionPolicy;

    while (this.ks.usedMemory > max) {
      if (policy === "noeviction") return false;
      const victim =
        policy === "volatile-lru"
          ? this.ks.lruOldest((k) => this.ks.getExpire(k) != null)
          : this.ks.lruOldest();
      if (victim === undefined) return false;
      this.ks.evict(victim);
    }
    return true;
  }
}
