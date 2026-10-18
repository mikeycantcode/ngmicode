import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";

let clock: ManualClock;
let store: Store;
const run = (line: string) => store.exec(line);

beforeEach(() => {
  clock = new ManualClock(10_000);
  store = new Store({ clock });
});

it("deep-copies every aggregate type", () => {
  run("RPUSH l a b");
  run("HSET h f 1");
  run("ZADD z 1 m");
  run("SET s str");
  expect(run("COPY l l2")).toBe(1);
  expect(run("COPY h h2")).toBe(1);
  expect(run("COPY z z2")).toBe(1);
  expect(run("COPY s s2")).toBe(1);
  run("RPUSH l c");
  run("LPUSH l2 z");
  run("HSET h g 2");
  run("HINCRBY h2 f 10");
  run("ZADD z 2 n");
  run("ZINCRBY z2 5 m");
  expect(run("LRANGE l 0 -1")).toEqual(["a", "b", "c"]);
  expect(run("LRANGE l2 0 -1")).toEqual(["z", "a", "b"]);
  expect(run("HGETALL h")).toEqual(["f", "1", "g", "2"]);
  expect(run("HGETALL h2")).toEqual(["f", "11"]);
  expect(run("ZRANGE z 0 -1 WITHSCORES")).toEqual(["m", "1", "n", "2"]);
  expect(run("ZRANGE z2 0 -1 WITHSCORES")).toEqual(["m", "6"]);
  expect(run("GET s2")).toBe("str");
});

it("handles TTL, REPLACE, missing/expired source and errors", () => {
  run("SET src v PX 5000");
  run("SET dst old EX 100");
  expect(run("COPY src dst")).toBe(0);
  expect(run("GET dst")).toBe("old");
  expect(run("COPY src dst REPLACE")).toBe(1);
  expect(run("PTTL dst")).toBe(5000);
  run("SET plain p");
  run("SET withttl x EX 50");
  expect(run("COPY plain withttl replace")).toBe(1);
  expect(run("TTL withttl")).toBe(-1);
  expect(run("COPY nope x")).toBe(0);
  expect(run("EXISTS x")).toBe(0);
  expect(run("COPY src src")).toMatchObject({ message: "ERR source and destination objects are the same" });
  expect(run("COPY src y NOW")).toMatchObject({ message: "ERR syntax error" });
  clock.advance(6000);
  expect(run("COPY src fresh")).toBe(0);
  expect(run("EXISTS fresh")).toBe(0);
});

it("is durable through WAL replay and visible to WATCH", () => {
  run("RPUSH l a b c");
  run("PEXPIRE l 3000");
  run("COPY l l2");
  run("RPOP l");
  run("SET d x");
  const a = store.connect();
  const b = store.connect();
  a.exec("WATCH d");
  b.exec("COPY l2 d REPLACE");
  a.exec("MULTI");
  a.exec("SET d mine");
  expect(a.exec("EXEC")).toBeNull();
  b.exec("MULTI");
  b.exec("COPY d d3");
  expect(b.exec("EXEC")).toEqual([1]);

  clock.advance(1000);
  const restored = Store.restore({ clock }, { wal: [...store.wal.entries] });
  expect(restored.dump()).toEqual(store.dump());
  expect(restored.exec("PTTL d3")).toBe(2000);
  expect(restored.exec("LRANGE l2 0 -1")).toEqual(["a", "b", "c"]);
});

it("accounts memory for the copy", () => {
  run("RPUSH src aaaaaaaaaa bbbbbbbbbb");
  const one = store.info().used_memory as number;
  run("COPY src dst");
  expect(store.info().used_memory).toBe(one * 2);
  run("DEL src dst");
  expect(store.info().used_memory).toBe(0);
});
