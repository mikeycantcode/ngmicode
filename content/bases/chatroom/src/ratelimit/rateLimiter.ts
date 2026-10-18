import type { BucketConfig } from "../config";
import type { Clock } from "../util/clock";

// Classic token bucket. Starts full. Tokens refill continuously at
// refillPerSecond, capped at capacity.

export class TokenBucket {
  readonly capacity: number;
  readonly refillPerSecond: number;
  private tokens: number;
  private updatedAt: number;
  private clock: Clock;

  constructor(capacity: number, refillPerSecond: number, clock: Clock) {
    if (capacity <= 0 || refillPerSecond <= 0) throw new RangeError("capacity and refill rate must be positive");
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.clock = clock;
    this.tokens = capacity;
    this.updatedAt = clock.now();
  }

  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Takes `cost` tokens if available. Returns 0 on success, else ms until it would succeed. */
  tryTake(cost = 1): number {
    if (cost > this.capacity) return Infinity;
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return 0;
    }
    const missing = cost - this.tokens;
    return Math.ceil((missing / this.refillPerSecond) * 1000);
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = now - this.updatedAt;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSecond);
    this.updatedAt = now;
  }
}

export interface RateDecision {
  allowed: boolean;
  retryAfterMs: number;
}

// Keyed buckets: one per (subject, bucket name). Bucket names map to configs;
// unknown names fall back to "default".

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private configs: Record<string, BucketConfig>;
  private clock: Clock;

  constructor(configs: Record<string, BucketConfig>, clock: Clock) {
    this.configs = configs;
    this.clock = clock;
  }

  check(subject: string, bucketName = "default", cost = 1): RateDecision {
    const key = `${bucketName}|${subject}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const cfg = this.configs[bucketName] ?? this.configs.default;
      bucket = new TokenBucket(cfg.capacity, cfg.refillPerSecond, this.clock);
      this.buckets.set(key, bucket);
    }
    const wait = bucket.tryTake(cost);
    return { allowed: wait === 0, retryAfterMs: wait };
  }

  reset(subject?: string): void {
    if (!subject) {
      this.buckets.clear();
      return;
    }
    for (const key of [...this.buckets.keys()]) if (key.endsWith(`|${subject}`)) this.buckets.delete(key);
  }
}
