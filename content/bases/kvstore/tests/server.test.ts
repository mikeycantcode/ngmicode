import { describe, it, expect } from "testkit";
import { Store } from "../src/store";
import { ManualClock } from "../src/util/clock";
import { ErrorReply } from "../src/types";
import { ENTRY_OVERHEAD } from "../src/core/sizeof";
import { decodeCommand } from "../src/persistence/codec";

describe("memory accounting", () => {
  it("tracks used_memory across writes and deletes", () => {
    const store = new Store({ clock: new ManualClock(0) });
    store.exec("SET k 12345");
    expect(store.info().used_memory).toBe(ENTRY_OVERHEAD + 1 + 5);
    store.exec("APPEND k 678");
    expect(store.info().used_memory).toBe(ENTRY_OVERHEAD + 1 + 8);
    store.exec("DEL k");
    expect(store.info().used_memory).toBe(0);
  });
});

describe("eviction", () => {
  it("noeviction rejects writes over budget but allows reads/deletes", () => {
    const store = new Store({ clock: new ManualClock(0), config: { maxmemory: 120 } });
    store.exec("SET a 0123456789");
    store.exec("SET b 0123456789");
    store.exec("SET c 0123456789"); // allowed: budget is checked before the command
    expect((store.exec("SET d x") as ErrorReply).message).toMatch(/^OOM/);
    expect(store.exec("GET a")).toBe("0123456789");
    expect(store.exec("DEL a")).toBe(1);
    expect(store.exec("SET d x")).toBe("OK");
  });

  it("allkeys-lru evicts the least recently used key", () => {
    const store = new Store({
      clock: new ManualClock(0),
      config: { maxmemory: 3 * (ENTRY_OVERHEAD + 2 + 10), "maxmemory-policy": "allkeys-lru" },
    });
    store.exec("SET k1 0123456789");
    store.exec("SET k2 0123456789");
    store.exec("SET k3 0123456789");
    store.exec("GET k1"); // k2 is now the LRU
    store.exec("SET k4 0123456789");
    store.exec("SET k5 0123456789");
    expect(store.exec("EXISTS k2")).toBe(0);
    expect(store.exec("EXISTS k1")).toBe(1);
    expect(store.info().evicted_keys).toBe(1);
    expect(store.wal.entries.map((e) => decodeCommand(e)).some((c) => c[0] === "DEL" && c[1] === "k2")).toBe(true);
  });

  it("volatile-lru only evicts keys with a TTL", () => {
    const store = new Store({
      clock: new ManualClock(0),
      config: { maxmemory: 2 * (ENTRY_OVERHEAD + 2 + 10), "maxmemory-policy": "volatile-lru" },
    });
    store.exec("SET p1 0123456789");
    store.exec("SET v1 0123456789 EX 100");
    store.exec("SET p2 0123456789");
    store.exec("SET p3 0123456789");
    expect(store.exec("EXISTS v1")).toBe(0);
    expect(store.exec("EXISTS p1")).toBe(1);
    expect((store.exec("SET p4 x") as ErrorReply).message).toMatch(/^OOM/);
  });
});

describe("CONFIG / INFO", () => {
  it("gets and sets parameters", () => {
    const store = new Store();
    expect(store.exec("CONFIG GET maxmemory*")).toEqual(["maxmemory", "0", "maxmemory-policy", "noeviction"]);
    expect(store.exec("CONFIG SET maxmemory-policy ALLKEYS-LRU")).toBe("OK");
    expect(store.config.get("maxmemory-policy")).toBe("allkeys-lru");
    expect(store.exec("CONFIG SET maxmemory-policy random")).toBeInstanceOf(ErrorReply);
    expect(store.exec("CONFIG SET nope 1")).toBeInstanceOf(ErrorReply);
  });

  it("counts hits and misses", () => {
    const store = new Store({ clock: new ManualClock(0) });
    store.exec("SET a 1");
    store.exec("GET a");
    store.exec("GET b");
    store.exec("HGET a f"); // wrong type still counts as a hit
    const info = store.info();
    expect(info.keyspace_hits).toBe(2);
    expect(info.keyspace_misses).toBe(1);
    expect(String(store.exec("INFO"))).toContain("keyspace_hits:2");
  });
});

describe("SCAN / KEYS", () => {
  it("iterates every key exactly once", () => {
    const store = new Store({ clock: new ManualClock(0) });
    for (let i = 0; i < 37; i++) store.exec(`SET key:${i} v`);
    store.exec("RPUSH list:1 x");
    const seen: string[] = [];
    let cursor = "0";
    let calls = 0;
    do {
      const [next, keys] = store.exec(`SCAN ${cursor} MATCH key:* COUNT 5`) as [string, string[]];
      seen.push(...keys);
      cursor = next;
      calls++;
    } while (cursor !== "0" && calls < 100);
    expect(seen.length).toBe(37);
    expect(new Set(seen).size).toBe(37);
  });

  it("filters by TYPE and supports KEYS", () => {
    const store = new Store({ clock: new ManualClock(0) });
    store.exec("SET s v");
    store.exec("RPUSH l x");
    expect(store.exec("SCAN 0 TYPE list")).toEqual(["0", ["l"]]);
    expect(store.exec("KEYS *")).toEqual(["l", "s"]);
    expect(store.exec("SCAN 999")).toBeInstanceOf(ErrorReply);
  });
});
