import { describe, it, expect } from "testkit";
import { Store } from "../src/store";
import { ManualClock } from "../src/util/clock";
import { decodeCommand, encodeCommand } from "../src/persistence/codec";
import { CorruptLogError } from "../src/errors";
import { ReplayError } from "../src/persistence/replay";

function populate(store: Store) {
  store.exec("SET s hello");
  store.exec("SET t temp EX 100");
  store.exec("RPUSH l a b c");
  store.exec("LPOP l");
  store.exec("HSET h f1 v1 f2 v2");
  store.exec("ZADD z 1 a 2.5 b -inf c");
  store.exec("INCRBYFLOAT n 0.1");
  store.exec("INCRBYFLOAT n 0.2");
  store.exec("EXPIRE l 50");
  store.exec("GET s");
}

describe("codec", () => {
  it("round-trips arbitrary arguments", () => {
    const argv = ["SET", "k", "line1\r\nline2", "", "ünïcödé", "$3\r\n"];
    expect(decodeCommand(encodeCommand(argv))).toEqual(argv);
  });

  it("rejects malformed entries", () => {
    expect(() => decodeCommand("*2\r\n$3\r\nGET\r\n")).toThrow(CorruptLogError);
    expect(() => decodeCommand(encodeCommand(["PING"]) + "x")).toThrow("trailing data");
  });
});

describe("WAL", () => {
  it("logs only writes that changed something", () => {
    const store = new Store({ clock: new ManualClock(0) });
    store.exec("GET nope");
    store.exec("DEL nope");
    store.exec("SET k v NX");
    store.exec("SET k v2 NX");
    expect(store.wal.entries.map((e) => decodeCommand(e))).toEqual([["SET", "k", "v", "NX"]]);
  });

  it("propagates relative TTLs as absolute", () => {
    const store = new Store({ clock: new ManualClock(5_000) });
    store.exec("SET k v EX 10");
    store.exec("EXPIRE k 20");
    expect(store.wal.entries.map((e) => decodeCommand(e))).toEqual([
      ["SET", "k", "v", "PXAT", "15000"],
      ["PEXPIREAT", "k", "25000"],
    ]);
  });

  it("replay reproduces the keyspace later in time", () => {
    const clock = new ManualClock(1_000);
    const store = new Store({ clock });
    populate(store);
    clock.advance(30_000);
    const restored = Store.restore({ clock }, { wal: [...store.wal.entries] });
    expect(restored.dump()).toEqual(store.dump());
    expect(restored.exec("PTTL t")).toBe(store.exec("PTTL t"));
  });

  it("replay does not append to the WAL", () => {
    const store = new Store({ clock: new ManualClock(0) });
    populate(store);
    const fresh = new Store({ clock: new ManualClock(0) });
    expect(fresh.replay(store.wal.entries)).toBe(store.wal.length);
    expect(fresh.wal.length).toBe(0);
  });

  it("replay does not expire keys while loading", () => {
    const clock = new ManualClock(1_000);
    const store = new Store({ clock });
    store.exec("SET r v EX 5");
    store.exec("PERSIST r");
    clock.advance(60_000);
    const restored = Store.restore({ clock }, { wal: [...store.wal.entries] });
    expect(restored.exec("GET r")).toBe("v");
  });

  it("replay fails loudly on a command error", () => {
    const fresh = new Store({ clock: new ManualClock(0) });
    const entries = [encodeCommand(["RPUSH", "l", "x"]), encodeCommand(["INCR", "l"])];
    expect(() => fresh.replay(entries)).toThrow(ReplayError);
  });
});

describe("snapshots and compaction", () => {
  it("snapshot + restore", () => {
    const clock = new ManualClock(1_000);
    const store = new Store({ clock });
    populate(store);
    const snap = store.snapshot();
    const restored = Store.restore({ clock }, { snapshot: snap });
    expect(restored.dump()).toEqual(store.dump());
    expect(restored.exec("ZRANGE z 0 -1 WITHSCORES")).toEqual(["c", "-inf", "a", "1", "b", "2.5"]);
  });

  it("detects a corrupted snapshot", () => {
    const store = new Store({ clock: new ManualClock(0) });
    store.exec("SET k v");
    const snap = store.snapshot().replace('"v"', '"w"');
    expect(() => Store.restore({}, { snapshot: snap })).toThrow("checksum mismatch");
  });

  it("BGREWRITEAOF compacts the WAL without changing state", () => {
    const clock = new ManualClock(1_000);
    const store = new Store({ clock });
    populate(store);
    for (let i = 0; i < 20; i++) store.exec("INCR counter");
    const before = store.wal.length;
    store.exec("BGREWRITEAOF");
    expect(store.wal.length).toBeLessThan(before);
    const restored = Store.restore({ clock }, { wal: [...store.wal.entries] });
    expect(restored.dump()).toEqual(store.dump());
  });
});
