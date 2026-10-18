import { it, expect, beforeEach } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";

let clock: ManualClock;
let store: Store;
let events: string[];

beforeEach(() => {
  clock = new ManualClock(1_000);
  store = new Store({ clock });
  events = [];
  store.events.on("expired", ({ key }) => events.push(key));
});

it("counts lazy expiry on read", () => {
  store.exec("SET session:1 x PX 100");
  clock.advance(150);
  expect(store.exec("GET session:1")).toBeNull();
  expect(store.info().expired_keys).toBe(1);
  expect(events).toEqual(["session:1"]);
});

it("counts active expiry exactly once per key", () => {
  store.exec("SET a 1 PX 100");
  store.exec("SET b 1 PX 100");
  store.exec("SET c 1 PX 100");
  store.exec("SET keep 1");
  clock.advance(100);
  expect(store.tick()).toBe(3);
  expect(store.info().expired_keys).toBe(3);
  expect(events.sort()).toEqual(["a", "b", "c"]);
});

it("counts each key once across mixed paths (EXISTS, SET, tick)", () => {
  store.exec("SET a 1 PX 100");
  store.exec("SET b 1 PX 100");
  store.exec("SET c 1 PX 100");
  clock.advance(500);
  expect(store.exec("EXISTS a")).toBe(0); // lazy via EXISTS
  store.exec("SET b fresh"); // lazy via a write
  store.tick(); // active reaps c
  store.tick();
  expect(store.info().expired_keys).toBe(3);
  expect(events.sort()).toEqual(["a", "b", "c"]);
  expect(store.exec("GET b")).toBe("fresh");
});
