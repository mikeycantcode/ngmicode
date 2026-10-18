import { it, expect } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";
import { ENTRY_OVERHEAD, entrySize } from "../../src/core/sizeof";

const KEY_BYTES = ENTRY_OVERHEAD + 6 + 10; // "k00000" + 10-char value
const key = (i: number) => "k" + String(i).padStart(5, "0");

function recomputed(store: Store): number {
  let n = 0;
  for (const k of store.ks.keys()) n += entrySize(k, store.ks.peek(k)!.value);
  return n;
}

it("sustains eviction at scale (40k live keys, 40k evictions) quickly", () => {
  const store = new Store({
    clock: new ManualClock(0),
    config: { maxmemory: 40_000 * KEY_BYTES, "maxmemory-policy": "allkeys-lru" },
  });
  const t0 = Date.now();
  for (let i = 0; i < 80_000; i++) store.exec(["SET", key(i), "0123456789"]);
  const elapsed = Date.now() - t0;
  const info = store.info();
  expect(info.evicted_keys).toBeGreaterThanOrEqual(39_999);
  expect(info.used_memory).toBeLessThanOrEqual(40_000 * KEY_BYTES + KEY_BYTES);
  expect(store.exec(["EXISTS", key(0)])).toBe(0);
  expect(store.exec(["EXISTS", key(79_999)])).toBe(1);
  expect(elapsed).toBeLessThan(1_500);
});

it("evicts by recency of access, including reads and in-place writes", () => {
  const store = new Store({
    clock: new ManualClock(0),
    config: { maxmemory: 4 * KEY_BYTES, "maxmemory-policy": "allkeys-lru" },
  });
  for (let i = 0; i < 4; i++) store.exec(["SET", key(i), "0123456789"]);
  store.exec(["GET", key(0)]); // read refreshes k00000
  store.exec(["SET", key(1), "0123456789", "XX"]); // overwrite refreshes k00001
  store.exec(["SET", key(4), "0123456789"]); // now 5 keys: over budget
  store.exec(["SET", key(5), "0123456789"]); // evicts k00002 (LRU)
  store.exec(["SET", key(6), "0123456789"]); // evicts k00003
  expect(store.exec("KEYS *")).toEqual([key(0), key(1), key(4), key(5), key(6)]);
  expect(store.info().evicted_keys).toBe(2);
});

it("keeps used_memory exact through every kind of mutation", () => {
  const clock = new ManualClock(0);
  const store = new Store({ clock });
  const check = () => expect(store.info().used_memory).toBe(recomputed(store));
  store.exec("SET a 1");
  store.exec("SET a 1234567890");
  check();
  store.exec("RPUSH l x");
  for (let i = 0; i < 50; i++) store.exec(`LPUSH l item${i}`);
  check();
  store.exec("LPOP l 10");
  store.exec("HSET h f1 v1 f2 v2");
  store.exec("HINCRBY h n 100000");
  store.exec("HDEL h f1");
  store.exec("ZADD z 1 aaa 2 bbbbbb");
  store.exec("ZREM z aaa");
  store.exec("APPEND a xyz");
  store.exec("INCR counter");
  store.exec("RENAME a b");
  check();
  store.exec("SET t v PX 10");
  clock.advance(20);
  store.exec("GET t");
  store.exec("DEL l");
  check();
  expect(store.info().used_memory).toBeGreaterThan(0);
  store.exec("FLUSHALL");
  expect(store.info().used_memory).toBe(0);
});
