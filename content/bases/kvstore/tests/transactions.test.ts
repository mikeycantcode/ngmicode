import { describe, it, expect, beforeEach } from "testkit";
import { Store } from "../src/store";
import type { Session } from "../src/server/session";
import { ManualClock } from "../src/util/clock";
import { ErrorReply } from "../src/types";
import { decodeCommand } from "../src/persistence/codec";

let store: Store;
let a: Session;
let b: Session;

beforeEach(() => {
  store = new Store({ clock: new ManualClock(0) });
  a = store.connect();
  b = store.connect();
});

describe("MULTI / EXEC", () => {
  it("queues and executes atomically", () => {
    expect(a.exec("MULTI")).toBe("OK");
    expect(a.exec("SET x 1")).toBe("QUEUED");
    expect(a.exec("INCR x")).toBe("QUEUED");
    expect(b.exec("GET x")).toBeNull();
    expect(a.exec("EXEC")).toEqual(["OK", 2]);
    expect(b.exec("GET x")).toBe("2");
  });

  it("runtime errors do not roll back other commands", () => {
    a.exec("RPUSH l x");
    a.exec("MULTI");
    a.exec("SET s 1");
    a.exec("INCR l");
    const r = a.exec("EXEC") as unknown[];
    expect(r[0]).toBe("OK");
    expect(r[1]).toBeInstanceOf(ErrorReply);
    expect(a.exec("GET s")).toBe("1");
  });

  it("queueing errors abort the transaction", () => {
    a.exec("MULTI");
    a.exec("SET s 1");
    a.exec("NOSUCHCMD");
    expect((a.exec("EXEC") as ErrorReply).message).toMatch(/^EXECABORT/);
    expect(a.exec("GET s")).toBeNull();
  });

  it("DISCARD drops the queue", () => {
    a.exec("MULTI");
    a.exec("SET s 1");
    expect(a.exec("DISCARD")).toBe("OK");
    expect(a.exec("GET s")).toBeNull();
    expect((a.exec("EXEC") as ErrorReply).message).toBe("ERR EXEC without MULTI");
  });

  it("wraps multi-write transactions in MULTI/EXEC in the WAL", () => {
    a.exec("MULTI");
    a.exec("SET x 1");
    a.exec("SET y 2");
    a.exec("GET x");
    a.exec("EXEC");
    expect(store.wal.entries.map((e) => decodeCommand(e)[0])).toEqual(["MULTI", "SET", "SET", "EXEC"]);
  });
});

describe("WATCH", () => {
  it("aborts EXEC when a watched key changed", () => {
    a.exec("SET bal 10");
    a.exec("WATCH bal");
    b.exec("INCRBY bal 5");
    a.exec("MULTI");
    a.exec("SET bal 0");
    expect(a.exec("EXEC")).toBeNull();
    expect(a.exec("GET bal")).toBe("15");
  });

  it("commits when nothing changed, and UNWATCH clears", () => {
    a.exec("SET bal 10");
    a.exec("WATCH bal");
    b.exec("GET bal");
    a.exec("MULTI");
    a.exec("DECRBY bal 3");
    expect(a.exec("EXEC")).toEqual([7]);

    a.exec("WATCH bal");
    b.exec("SET bal 100");
    a.exec("UNWATCH");
    a.exec("MULTI");
    a.exec("INCR bal");
    expect(a.exec("EXEC")).toEqual([101]);
  });

  it("detects deletion of a watched key", () => {
    a.exec("SET k v");
    a.exec("WATCH k");
    b.exec("DEL k");
    a.exec("MULTI");
    a.exec("SET k mine");
    expect(a.exec("EXEC")).toBeNull();
  });
});

describe("pub/sub", () => {
  it("delivers to channel and pattern subscribers", () => {
    expect(a.exec("SUBSCRIBE news")).toEqual([["subscribe", "news", 1]]);
    b.exec("PSUBSCRIBE n*");
    const c = store.connect();
    expect(c.exec("PUBLISH news hello")).toBe(2);
    expect(a.drain()).toEqual([{ kind: "message", channel: "news", payload: "hello" }]);
    expect(b.drain()).toEqual([{ kind: "pmessage", pattern: "n*", channel: "news", payload: "hello" }]);
    expect(c.exec("PUBLISH other x")).toBe(0);
  });

  it("unsubscribe and close", () => {
    a.exec("SUBSCRIBE c1 c2");
    expect(a.exec("UNSUBSCRIBE c1")).toEqual([["unsubscribe", "c1", 1]]);
    a.close();
    expect(store.exec("PUBLISH c2 x")).toBe(0);
    expect(store.info().pubsub_channels).toBe(0);
  });

  it("PUBLISH is not written to the WAL", () => {
    store.exec("PUBLISH ch m");
    expect(store.wal.length).toBe(0);
  });
});
