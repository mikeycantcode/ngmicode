// Active expiry. Lazy expiry (Keyspace.expireIfNeeded on access) alone would
// leak memory for keys that are never touched again, so the host calls
// store.tick() periodically and we reap expired keys in small batches.
//
// Algorithm (adapted from Redis activeExpireCycle):
//   repeat up to MAX_ROUNDS:
//     take the next `active-expire-samples` volatile keys (round robin)
//     expire the ones whose TTL elapsed
//     stop if fewer than 25% of the sample had expired

import type { Config } from "../config";
import type { Keyspace } from "./keyspace";

const MAX_ROUNDS = 16;

export class ExpiryManager {
  constructor(
    private ks: Keyspace,
    private config: Config,
  ) {}

  /** Runs one active-expire cycle. Returns the number of keys removed. */
  cycle(): number {
    let total = 0;
    const samples = this.config.getNumber("active-expire-samples");
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const sample = this.ks.sampleVolatile(samples);
      if (sample.length === 0) break;
      let expired = 0;
      for (const key of sample) {
        if (this.ks.expireIfNeeded(key)) {
          expired++;
          // Count + notify here (perf: keeps the lazy path in GET as cheap as possible).
          this.ks.stats.expiredKeys++;
          this.ks.events.emit("expired", { key });
        }
      }
      total += expired;
      if (expired * 4 < sample.length) break;
    }
    return total;
  }
}
