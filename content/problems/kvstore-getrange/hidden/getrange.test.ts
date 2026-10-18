import { describe, it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";

let store: Store;
const run = (line: string) => store.exec(line);

beforeEach(() => {
  store = new Store({ clock: new ManualClock(0) });
  store.exec(`SET k "Hello World"`);
});

describe("GETRANGE", () => {
  it("applies Redis index rules (inclusive end, negative indexes, clamping)", () => {
    expect(run("GETRANGE k 0 4")).toBe("Hello");
    expect(run("GETRANGE k -5 -1")).toBe("World");
    expect(run("GETRANGE k 0 -1")).toBe("Hello World");
    expect(run("GETRANGE k 6 1000")).toBe("World");
    expect(run("GETRANGE k 0 -100")).toBe("H");
    expect(run("GETRANGE k -1 -5")).toBe("");
    expect(run("GETRANGE k 5 2")).toBe("");
    expect(run("GETRANGE k 11 20")).toBe("");
    expect(run("GETRANGE nope 0 -1")).toBe("");
  });

  it("reports errors exactly", () => {
    run("RPUSH l x");
    expect(run("GETRANGE l 0 1")).toMatchObject({ message: "WRONGTYPE Operation against a key holding the wrong kind of value" });
    expect(run("GETRANGE k a 1")).toMatchObject({ message: "ERR value is not an integer or out of range" });
    expect(run("GETRANGE nope 0 1.5")).toMatchObject({ message: "ERR value is not an integer or out of range" });
    expect(run("GETRANGE k 0")).toMatchObject({ message: "ERR wrong number of arguments for 'getrange' command" });
  });

  it("is read-only: never logged, counts hits/misses, works in MULTI", () => {
    const walBefore = store.wal.length;
    const before = store.info();
    run("GETRANGE k 0 2");
    run("GETRANGE missing 0 2");
    const after = store.info();
    expect(store.wal.length).toBe(walBefore);
    expect(after.keyspace_hits).toBe((before.keyspace_hits as number) + 1);
    expect(after.keyspace_misses).toBe((before.keyspace_misses as number) + 1);

    run("MULTI");
    expect(run("GETRANGE k 6 -1")).toBe("QUEUED");
    expect(run("EXEC")).toEqual(["World"]);
    expect(store.wal.length).toBe(walBefore);
  });
});
