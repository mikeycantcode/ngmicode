import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import type { Session } from "../../src/server/session";
import { ManualClock } from "../../src/util/clock";

let clock: ManualClock;
let store: Store;
let sub: Session;

const events = (s: Session) => s.drain().map((m) => [m.channel, m.payload]);

beforeEach(() => {
  clock = new ManualClock(1_000);
  store = new Store({ clock });
  sub = store.connect();
  sub.exec("PSUBSCRIBE __key*@0__:*");
});

it("publishes keyspace and keyevent messages only for keys that changed", () => {
  store.exec("SET quiet 1");
  expect(sub.drain()).toEqual([]); // disabled by default
  expect(store.exec("CONFIG SET notify-keyspace-events KE")).toBe("OK");
  store.exec("SET a 1");
  expect(events(sub)).toEqual([
    ["__keyspace@0__:a", "set"],
    ["__keyevent@0__:set", "a"],
  ]);
  store.exec("CONFIG SET notify-keyspace-events E");
  store.exec("MSET b 2 c 3");
  store.exec("DEL a missing");
  store.exec("SET b x NX");
  store.exec("HDEL nohash f");
  store.exec("LPOP nolist");
  store.exec("RPUSH l x");
  store.exec("RENAME l l2");
  store.exec("GET b");
  expect(events(sub)).toEqual([
    ["__keyevent@0__:mset", "b"],
    ["__keyevent@0__:mset", "c"],
    ["__keyevent@0__:del", "a"],
    ["__keyevent@0__:rpush", "l"],
    ["__keyevent@0__:rename", "l"],
    ["__keyevent@0__:rename", "l2"],
  ]);
  expect(store.wal.entries.some((e) => e.includes("PUBLISH"))).toBe(false);
});

it("publishes expired (lazy and active) and evicted", () => {
  store.exec("CONFIG SET notify-keyspace-events K");
  store.exec("SET lazy v PX 100");
  store.exec("SET active v PX 100");
  sub.drain();
  clock.advance(200);
  expect(store.exec("DEL lazy")).toBe(0);
  store.tick();
  expect(events(sub)).toEqual([
    ["__keyspace@0__:lazy", "expired"],
    ["__keyspace@0__:active", "expired"],
  ]);
  store.exec("CONFIG SET maxmemory 1");
  store.exec("CONFIG SET maxmemory-policy allkeys-lru");
  store.exec("SET x 1");
  store.exec("SET y 2");
  expect(events(sub)).toEqual([
    ["__keyspace@0__:x", "set"],
    ["__keyspace@0__:x", "evicted"],
    ["__keyspace@0__:y", "set"],
  ]);
});

it("publishes at EXEC time, and never during replay or snapshot restore", () => {
  store.exec("CONFIG SET notify-keyspace-events E");
  const tx = store.connect();
  tx.exec("MULTI");
  tx.exec("SET t 1");
  tx.exec("INCR t");
  expect(sub.drain()).toEqual([]);
  tx.exec("EXEC");
  expect(events(sub)).toEqual([
    ["__keyevent@0__:set", "t"],
    ["__keyevent@0__:incr", "t"],
  ]);

  store.exec("SET e v PX 50");
  clock.advance(100);
  store.exec("GET e"); // logs DEL e
  const fresh = new Store({ clock, config: { "notify-keyspace-events": "KE" } });
  const watcher = fresh.connect();
  watcher.exec("PSUBSCRIBE *");
  fresh.replay([...store.wal.entries]);
  expect(watcher.drain()).toEqual([]);
  expect(fresh.exec("GET t")).toBe("2");
  expect(watcher.drain()).toEqual([]);

  const snap = store.snapshot();
  const restored = Store.restore({ clock, config: { "notify-keyspace-events": "KE" } }, { snapshot: snap });
  const w2 = restored.connect();
  w2.exec("PSUBSCRIBE *");
  restored.exec("GET t");
  expect(w2.drain()).toEqual([]);
  restored.exec("SET t 3");
  expect(w2.drain().length).toBe(2);
});

it("validates and canonicalizes the config value", () => {
  expect(store.exec("CONFIG SET notify-keyspace-events EK")).toBe("OK");
  expect(store.exec("CONFIG GET notify-keyspace-events")).toEqual(["notify-keyspace-events", "KE"]);
  expect(store.exec("CONFIG SET notify-keyspace-events KX")).toMatchObject({
    message: "ERR Invalid argument 'KX' for CONFIG SET 'notify-keyspace-events'",
  });
  expect(store.exec("CONFIG SET notify-keyspace-events \"\"")).toBe("OK");
  store.exec("SET a 1");
  expect(sub.drain()).toEqual([]);
});
