import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";

let store: Store;
const run = (line: string) => store.exec(line);

beforeEach(() => {
  store = new Store({ clock: new ManualClock(0) });
  run("ZADD z 1 a 2 b 2 c 2 aa 3 d 1.5 e -inf lo +inf hi");
});

it("handles inclusive, exclusive and infinite bounds with lexicographic ties", () => {
  expect(run("ZRANGEBYSCORE z 2 2")).toEqual(["aa", "b", "c"]);
  expect(run("ZRANGEBYSCORE z (1 2")).toEqual(["e", "aa", "b", "c"]);
  expect(run("ZRANGEBYSCORE z (2 +inf")).toEqual(["d", "hi"]);
  expect(run("ZRANGEBYSCORE z -inf (1.5")).toEqual(["lo", "a"]);
  expect(run("ZRANGEBYSCORE z (2 (3")).toEqual([]);
  expect(run("ZRANGEBYSCORE z 5 1")).toEqual([]);
  expect(run("ZRANGEBYSCORE missing -inf +inf")).toEqual([]);
});

it("supports WITHSCORES and LIMIT in any order", () => {
  expect(run("ZRANGEBYSCORE z 1.5 2 WITHSCORES")).toEqual(["e", "1.5", "aa", "2", "b", "2", "c", "2"]);
  expect(run("ZRANGEBYSCORE z 3 +inf withscores")).toEqual(["d", "3", "hi", "inf"]);
  expect(run("ZRANGEBYSCORE z 2 +inf LIMIT 1 2")).toEqual(["b", "c"]);
  expect(run("ZRANGEBYSCORE z 2 +inf limit 2 2 WITHSCORES")).toEqual(["c", "2", "d", "3"]);
  expect(run("ZRANGEBYSCORE z 2 +inf WITHSCORES LIMIT 3 -1")).toEqual(["d", "3", "hi", "inf"]);
  expect(run("ZRANGEBYSCORE z -inf +inf LIMIT -1 5")).toEqual([]);
  expect(run("ZRANGEBYSCORE z -inf +inf LIMIT 100 5")).toEqual([]);
});

it("reports errors exactly and is read-only", () => {
  const wal = store.wal.length;
  expect(run("ZRANGEBYSCORE z x 3")).toMatchObject({ message: "ERR min or max is not a float" });
  expect(run("ZRANGEBYSCORE z 1 (y")).toMatchObject({ message: "ERR min or max is not a float" });
  expect(run("ZRANGEBYSCORE z 1 3 LIMIT 0")).toMatchObject({ message: "ERR syntax error" });
  expect(run("ZRANGEBYSCORE z 1 3 BOGUS")).toMatchObject({ message: "ERR syntax error" });
  expect(run("ZRANGEBYSCORE z 1 3 LIMIT a 1")).toMatchObject({ message: "ERR value is not an integer or out of range" });
  run("SET s v");
  expect(run("ZRANGEBYSCORE s 1 3")).toMatchObject({ message: "WRONGTYPE Operation against a key holding the wrong kind of value" });
  expect(store.wal.length).toBe(wal + 1); // only the SET
});
