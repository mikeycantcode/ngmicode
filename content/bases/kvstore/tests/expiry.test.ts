import { describe, it, expect, beforeEach } from "testkit";
import { Store } from "../src/store";
import { ManualClock } from "../src/util/clock";
import { decodeCommand } from "../src/persistence/codec";

let clock: ManualClock;
let store: Store;
const run = (line: string) => store.exec(line);
const walCommands = () => store.wal.entries.map((e) => decodeCommand(e));

beforeEach(() => {
  clock = new ManualClock(10_000);
  store = new Store({ clock });
});

describe("TTL", () => {
  it("SET EX / PX and TTL / PTTL", () => {
    run("SET a 1 EX 10");
    run("SET b 1 PX 1500");
    expect(run("TTL a")).toBe(10);
    expect(run("PTTL b")).toBe(1500);
    expect(run("TTL nope")).toBe(-2);
    run("SET c 1");
    expect(run("TTL c")).toBe(-1);
    clock.advance(1_000);
    expect(run("PTTL a")).toBe(9_000);
  });

  it("overwriting with SET clears the TTL unless KEEPTTL", () => {
    run("SET a 1 EX 10");
    run("SET a 2");
    expect(run("TTL a")).toBe(-1);
    run("SET b 1 EX 10");
    run("SET b 2 KEEPTTL");
    expect(run("TTL b")).toBe(10);
  });

  it("EXPIRE / PERSIST / EXPIRE in the past", () => {
    run("SET k v");
    expect(run("EXPIRE k 5")).toBe(1);
    expect(run("PERSIST k")).toBe(1);
    expect(run("TTL k")).toBe(-1);
    expect(run("EXPIRE missing 5")).toBe(0);
    expect(run("EXPIRE k -1")).toBe(1);
    expect(run("EXISTS k")).toBe(0);
  });

  it("rejects non-positive SET expire", () => {
    expect(run("SET k v EX 0")).toMatchObject({ message: "ERR invalid expire time in 'set' command" });
  });
});

describe("lazy expiry", () => {
  it("removes an expired key on access", () => {
    run("SET k v PX 100");
    clock.advance(100);
    expect(run("GET k")).toBeNull();
    expect(store.info().expired_keys).toBe(1);
    expect(store.ks.size).toBe(0);
  });

  it("logs a DEL for the expired key", () => {
    run("SET k v PX 100");
    clock.advance(200);
    run("GET k");
    expect(walCommands()).toEqual([
      ["SET", "k", "v", "PXAT", "10100"],
      ["DEL", "k"],
    ]);
  });
});

describe("active expiry", () => {
  it("reaps untouched keys on tick()", () => {
    for (let i = 0; i < 50; i++) run(`SET k${i} v PX ${i < 40 ? 100 : 100_000}`);
    clock.advance(500);
    let removed = 0;
    for (let i = 0; i < 5; i++) removed += store.tick();
    expect(removed).toBe(40);
    expect(store.ks.size).toBe(10);
    expect(store.info().expired_keys).toBe(40);
  });

  it("emits an expired event per key", () => {
    const seen: string[] = [];
    store.events.on("expired", ({ key }) => seen.push(key));
    run("SET a 1 PX 10");
    run("SET b 1 PX 10");
    clock.advance(10);
    store.tick();
    expect(seen.sort()).toEqual(["a", "b"]);
  });
});
