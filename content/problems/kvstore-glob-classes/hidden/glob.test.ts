import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";

let store: Store;
const run = (line: string) => store.exec(line);
const keys = (pattern: string) => run(`KEYS ${pattern}`);

beforeEach(() => {
  store = new Store({ clock: new ManualClock(0) });
});

it("supports classes, ranges, reversed ranges and ^ negation", () => {
  for (const k of ["hallo", "hbllo", "hello", "hillo", "h-llo", "h!llo"]) run(`SET ${k} 1`);
  expect(keys("h[ae]llo")).toEqual(["hallo", "hello"]);
  expect(keys("h[a-e]llo")).toEqual(["hallo", "hbllo", "hello"]);
  expect(keys("h[e-a]llo")).toEqual(["hallo", "hbllo", "hello"]);
  expect(keys("h[^e]llo")).toEqual(["h!llo", "h-llo", "hallo", "hbllo", "hillo"]);
  expect(keys("h[!e]llo")).toEqual(["h!llo", "hello"]);
  expect(keys("h[-x]llo")).toEqual(["h-llo"]);
  expect(keys("h[a-ce-f]*")).toEqual(["hallo", "hbllo", "hello"]);
  const [, scanned] = run("SCAN 0 MATCH h[hi]llo COUNT 100") as [string, string[]];
  expect(scanned).toEqual(["hillo"]);
});

it("treats escapes, regex metacharacters and unclosed [ literally", () => {
  for (const k of ["a*b", "axb", "a.b", "a+b(1)", "x[1", "q]", "back\\"]) run(["SET", k, "1"]);
  expect(run(["KEYS", "a\\*b"])).toEqual(["a*b"]);
  expect(keys("a.b")).toEqual(["a.b"]);
  expect(run(["KEYS", "a+b(1)"])).toEqual(["a+b(1)"]);
  expect(run(["KEYS", "x[1"])).toEqual(["x[1"]);
  expect(run(["KEYS", "[\\]x]"])).toEqual([]);
  expect(run(["KEYS", "q[\\]]"])).toEqual(["q]"]);
  expect(run(["KEYS", "back\\"])).toEqual(["back\\"]);
  expect(keys("a?b")).toEqual(["a*b", "a.b", "axb"]);
});

it("applies the same syntax to PSUBSCRIBE", () => {
  const sub = store.connect();
  sub.exec("PSUBSCRIBE news.[a-c]*");
  const pub = store.connect();
  expect(pub.exec("PUBLISH news.alpha 1")).toBe(1);
  expect(pub.exec("PUBLISH news.zeta 2")).toBe(0);
  expect(sub.drain()).toEqual([{ kind: "pmessage", pattern: "news.[a-c]*", channel: "news.alpha", payload: "1" }]);
});
