import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import type { Session } from "../../src/server/session";
import { ManualClock } from "../../src/util/clock";
import { decodeCommand } from "../../src/persistence/codec";

let clock: ManualClock;
let store: Store;
let w1: Session;
let w2: Session;
let producer: Session;

beforeEach(() => {
  clock = new ManualClock(0);
  store = new Store({ clock });
  w1 = store.connect();
  w2 = store.connect();
  producer = store.connect();
});

it("pops immediately when data exists, never blocks on exec/MULTI, validates input", async () => {
  producer.exec("RPUSH q2 a b");
  expect(await w1.send("BLPOP q1 q2 5")).toEqual(["q2", "a"]);
  expect(w1.exec("BLPOP q1 q2 5")).toEqual(["q2", "b"]);
  expect(w1.exec("BLPOP q1 q2 5")).toBeNull();
  w1.exec("MULTI");
  expect(await w1.send("BLPOP q1 0")).toBe("QUEUED");
  expect(w1.exec("EXEC")).toEqual([null]);
  producer.exec("SET s v");
  expect(await w1.send("BLPOP s 1")).toMatchObject({ message: "WRONGTYPE Operation against a key holding the wrong kind of value" });
  expect(await w1.send("BLPOP q1 abc")).toMatchObject({ message: "ERR timeout is not a float or out of range" });
  expect(await w1.send("BLPOP q1 -1")).toMatchObject({ message: "ERR timeout is negative" });
});

it("wakes a blocked client after a push, and the WAL replays to the same state", async () => {
  let got: unknown = "pending";
  const p = w1.send("BLPOP jobs 0").then((r) => (got = r));
  await Promise.resolve();
  expect(got).toBe("pending");
  producer.exec("RPUSH jobs job-1");
  await p;
  expect(got).toEqual(["jobs", "job-1"]);
  expect(producer.exec("EXISTS jobs")).toBe(0);
  const log = store.wal.entries.map((e) => decodeCommand(e));
  expect(log).toEqual([
    ["RPUSH", "jobs", "job-1"],
    ["LPOP", "jobs"],
  ]);
  const restored = Store.restore({ clock }, { wal: [...store.wal.entries] });
  expect(restored.dump()).toEqual({});
});

it("serves waiters FIFO, one element each, after the whole EXEC", async () => {
  const r1 = w1.send("BLPOP q 0");
  const r2 = w2.send("BLPOP other q 0");
  producer.exec("MULTI");
  producer.exec("RPUSH q a b c");
  producer.exec("LPUSH q z");
  producer.exec("EXEC");
  expect(await r1).toEqual(["q", "z"]);
  expect(await r2).toEqual(["q", "a"]);
  expect(producer.exec("LRANGE q 0 -1")).toEqual(["b", "c"]);
  const restored = Store.restore({ clock }, { wal: [...store.wal.entries] });
  expect(restored.exec("LRANGE q 0 -1")).toEqual(["b", "c"]);
});

it("times out on the injected clock and never consumes later pushes; close cancels", async () => {
  const timed = w1.send("BLPOP q 1.5");
  const forever = w2.send("BLPOP never 0");
  clock.advance(1_499);
  let settled = false;
  timed.then(() => (settled = true));
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  clock.advance(1);
  expect(await timed).toBeNull();
  producer.exec("RPUSH q x");
  expect(producer.exec("LRANGE q 0 -1")).toEqual(["x"]);
  w2.close();
  expect(await forever).toBeNull();
  producer.exec("RPUSH never y");
  expect(producer.exec("LLEN never")).toBe(1);
});
