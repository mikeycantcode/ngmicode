// The keyspace: key → Entry, plus the bookkeeping every mutation must keep in
// sync — TTL index, LRU order, memory accounting and WATCH versions.
//
// Rule of thumb: commands never touch `data` directly. Read through
// lookupRead/lookupWrite/readAs/writeAs (they apply lazy expiry), and mutate
// through set/mutated/delete/setExpire/rename (they keep the indexes right).

import { WrongTypeError } from "../errors";
import type { Clock } from "../util/clock";
import type { Entry, Value, ValueOf, ValueType } from "../types";
import type { EventBus } from "./events";
import type { Stats } from "./stats";
import { entrySize, isEmptyAggregate } from "./sizeof";

export interface KeyspaceHooks {
  /** Called after a key is removed by expiry. The store uses it to log a DEL. */
  onExpired?(key: string): void;
  /** Called after a key is removed by eviction. */
  onEvicted?(key: string): void;
}

export interface SetOptions {
  /** Absolute expiry (ms) or null for none. Ignored when keepTtl is set. */
  expiresAt?: number | null;
  /** Keep the existing key's TTL (SET ... KEEPTTL). */
  keepTtl?: boolean;
}

export class Keyspace {
  private data = new Map<string, Entry>();
  /** key → expiresAt for volatile keys. Iteration order is the active-expiry round robin. */
  private volatile = new Map<string, number>();
  /** Recency order: first = least recently used. */
  private lru = new Map<string, true>();
  /**
   * WATCH support: key → stamp of its last modification, drawn from a single
   * monotonically increasing sequence. Deleted keys keep their stamp
   * (a tombstone), so DEL + SET can never reproduce an old stamp.
   * TODO(perf): tombstones are never collected.
   */
  private versions = new Map<string, number>();
  private seq = 0;

  /** Estimated bytes, see sizeof.ts. */
  usedMemory = 0;
  /** Incremented by every explicit mutation (not by expiry/eviction). The dispatcher uses it to decide whether to log. */
  dirty = 0;
  hooks: KeyspaceHooks = {};
  /**
   * True while the WAL is being replayed. Expiry is frozen while loading: the
   * log already contains an explicit DEL for every key that expired, so
   * expiring keys during replay would be wrong (e.g. it would drop a key that
   * a later PERSIST in the log rescued).
   */
  loading = false;

  constructor(
    readonly clock: Clock,
    readonly stats: Stats,
    readonly events: EventBus,
  ) {}

  get size(): number {
    return this.data.size;
  }

  get volatileCount(): number {
    return this.volatile.size;
  }

  // -------------------------------------------------------------------------
  // Expiry
  // -------------------------------------------------------------------------

  /** True when the key exists but its TTL has elapsed. No side effects. */
  isExpired(key: string): boolean {
    if (this.loading) return false;
    const at = this.volatile.get(key);
    return at !== undefined && at <= this.clock.now();
  }

  /**
   * Lazy expiry: if the key's TTL has elapsed, remove it now.
   * Returns true when the key was removed. Both lazy (on access) and active
   * (ExpiryManager) expiry go through here.
   */
  expireIfNeeded(key: string): boolean {
    if (!this.isExpired(key)) return false;
    this.removeEntry(key);
    this.stats.expiredKeys++;
    this.events.emit("expired", { key });
    this.hooks.onExpired?.(key);
    return true;
  }

  /**
   * Moves up to `count` volatile keys to the back of the round robin and
   * returns them. Used by the active expiry cycle.
   */
  sampleVolatile(count: number): string[] {
    const out: string[] = [];
    for (const key of this.volatile.keys()) {
      if (out.length >= count) break;
      out.push(key);
    }
    for (const key of out) {
      const at = this.volatile.get(key)!;
      this.volatile.delete(key);
      this.volatile.set(key, at);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Read access from a command: lazy expiry, hit/miss stats, LRU touch. */
  lookupRead(key: string): Value | undefined {
    this.expireIfNeeded(key);
    const e = this.data.get(key);
    if (!e) {
      this.stats.keyspaceMisses++;
      return undefined;
    }
    this.stats.keyspaceHits++;
    this.touch(key);
    return e.value;
  }

  /** Lookup for a command that is about to write: lazy expiry + LRU touch, no stats. */
  lookupWrite(key: string): Value | undefined {
    this.expireIfNeeded(key);
    const e = this.data.get(key);
    if (!e) return undefined;
    this.touch(key);
    return e.value;
  }

  /** lookupRead + type check. Missing key → undefined; wrong type → WRONGTYPE. */
  readAs<T extends ValueType>(key: string, type: T): ValueOf<T> | undefined {
    const v = this.lookupRead(key);
    if (v === undefined) return undefined;
    if (v.type !== type) throw new WrongTypeError();
    return v as ValueOf<T>;
  }

  /** lookupWrite + type check. */
  writeAs<T extends ValueType>(key: string, type: T): ValueOf<T> | undefined {
    const v = this.lookupWrite(key);
    if (v === undefined) return undefined;
    if (v.type !== type) throw new WrongTypeError();
    return v as ValueOf<T>;
  }

  /**
   * Returns the live entry without side effects (no lazy delete, no LRU, no
   * stats). Logically-expired keys are reported as missing. For SCAN,
   * snapshots, INFO and other introspection.
   */
  peek(key: string): Entry | undefined {
    if (this.isExpired(key)) return undefined;
    return this.data.get(key);
  }

  has(key: string): boolean {
    return this.peek(key) !== undefined;
  }

  /** Live (non-expired) keys, in insertion order. No side effects. */
  keys(): string[] {
    const out: string[] = [];
    for (const key of this.data.keys()) if (!this.isExpired(key)) out.push(key);
    return out;
  }

  /** Live entries. No side effects. */
  *entries(): IterableIterator<[string, Entry]> {
    for (const [key, e] of this.data) if (!this.isExpired(key)) yield [key, e];
  }

  getExpire(key: string): number | null | undefined {
    const e = this.peek(key);
    return e ? e.expiresAt : undefined;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** Create or overwrite a key. Overwriting clears the TTL unless keepTtl. */
  set(key: string, value: Value, opts: SetOptions = {}): void {
    this.expireIfNeeded(key);
    const prev = this.data.get(key);
    const expiresAt = opts.keepTtl ? (prev?.expiresAt ?? null) : (opts.expiresAt ?? null);
    const size = entrySize(key, value);
    this.usedMemory += size - (prev?.size ?? 0);
    this.data.set(key, { value, expiresAt, size });
    if (expiresAt === null) this.volatile.delete(key);
    else this.volatile.set(key, expiresAt);
    this.touch(key);
    this.bump(key);
    this.dirty++;
  }

  /**
   * Must be called after mutating an aggregate value in place (LPUSH, HSET,
   * ZADD, ...). Re-measures it, deletes it if it became empty, bumps the
   * WATCH version.
   */
  mutated(key: string): void {
    const e = this.data.get(key);
    if (!e) return;
    if (isEmptyAggregate(e.value)) {
      this.removeEntry(key);
      this.dirty++;
      return;
    }
    const size = entrySize(key, e.value);
    this.usedMemory += size - e.size;
    e.size = size;
    this.touch(key);
    this.bump(key);
    this.dirty++;
  }

  /** DEL semantics: returns false if the key did not exist (or had expired). */
  delete(key: string): boolean {
    this.expireIfNeeded(key);
    if (!this.data.has(key)) return false;
    this.removeEntry(key);
    this.dirty++;
    return true;
  }

  /** Set (number) or clear (null) a key's TTL. Returns false if the key does not exist. */
  setExpire(key: string, expiresAt: number | null): boolean {
    this.expireIfNeeded(key);
    const e = this.data.get(key);
    if (!e) return false;
    e.expiresAt = expiresAt;
    if (expiresAt === null) this.volatile.delete(key);
    else this.volatile.set(key, expiresAt);
    this.bump(key);
    this.dirty++;
    return true;
  }

  /** RENAME semantics: moves value and TTL, overwriting dst. Returns false if src is missing. */
  rename(src: string, dst: string): boolean {
    this.expireIfNeeded(src);
    const e = this.data.get(src);
    if (!e) return false;
    if (src === dst) return true;
    this.removeEntry(src);
    this.set(dst, e.value, { expiresAt: e.expiresAt });
    return true;
  }

  /** Removes a key on behalf of the eviction policy. */
  evict(key: string): void {
    if (!this.data.has(key)) return;
    this.removeEntry(key);
    this.stats.evictedKeys++;
    this.events.emit("evicted", { key });
    this.hooks.onEvicted?.(key);
  }

  flush(): number {
    const n = this.data.size;
    for (const key of this.data.keys()) this.bump(key);
    this.data.clear();
    this.volatile.clear();
    this.lru.clear();
    this.usedMemory = 0;
    this.dirty++;
    return n;
  }

  // -------------------------------------------------------------------------
  // LRU / WATCH
  // -------------------------------------------------------------------------

  /** Least recently used key, or undefined when empty. */
  lruOldest(filter?: (key: string) => boolean): string | undefined {
    for (const key of this.lru.keys()) if (!filter || filter(key)) return key;
    return undefined;
  }

  version(key: string): number {
    return this.versions.get(key) ?? 0;
  }

  private touch(key: string): void {
    this.lru.delete(key);
    this.lru.set(key, true);
  }

  private bump(key: string): void {
    this.versions.set(key, ++this.seq);
  }

  private removeEntry(key: string): void {
    const e = this.data.get(key);
    if (!e) return;
    this.usedMemory -= e.size;
    this.data.delete(key);
    this.volatile.delete(key);
    this.lru.delete(key);
    this.bump(key);
  }
}
