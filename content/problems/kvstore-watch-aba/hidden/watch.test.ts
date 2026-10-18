import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import type { Session } from "../../src/server/session";
import { ManualClock } from "../../src/util/clock";

let clock: ManualClock;
let store: Store;
let a: Session;
let b: Session;

beforeEach(() => {
  clock = new ManualClock(1_000);
  store = new Store({ clock });
  a = store.connect();
  b = store.connect();
});

function txSet(key: string, value: string) {
  a.exec("MULTI");
  a.exec(`SET ${key} ${value}`);
  return a.exec("EXEC");
}

it("aborts when the watched key is deleted and re-created with the same value (ABA)", () => {
  b.exec("SET wallet 100");
  a.exec("WATCH wallet");
  b.exec("DEL wallet");
  b.exec("SET wallet 100");
  expect(txSet("wallet", "90")).toBeNull();
  expect(b.exec("GET wallet")).toBe("100");
});

it("aborts when a watched key expired, even if nothing touched it since", () => {
  b.exec("SET wallet 100");
  b.exec("SET lease w1 PX 500");
  a.exec("WATCH wallet lease");
  clock.advance(600);
  expect(txSet("wallet", "90")).toBeNull();
  expect(b.exec("GET wallet")).toBe("100");
});

it("aborts after FLUSHALL even when the key is written back", () => {
  b.exec("SET wallet 100");
  a.exec("WATCH wallet");
  b.exec("FLUSHALL");
  b.exec("SET wallet 100");
  expect(txSet("wallet", "90")).toBeNull();
});

it("does not abort when watched keys were untouched", () => {
  b.exec("SET wallet 100");
  b.exec("SET lease w1 PX 5000");
  b.exec("DEL gone");
  a.exec("WATCH wallet lease never-existed");
  b.exec("SET other 1");
  b.exec("DEL other");
  b.exec("GET wallet");
  clock.advance(1000);
  expect(txSet("wallet", "90")).toEqual(["OK"]);
  expect(b.exec("GET wallet")).toBe("90");
});
