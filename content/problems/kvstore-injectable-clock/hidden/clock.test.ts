import { it, expect } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";
import { decodeCommand } from "../../src/persistence/codec";

it("SETEX / PSETEX use the injected clock", () => {
  const clock = new ManualClock(1_000);
  const store = new Store({ clock });
  store.exec("SETEX a 10 v");
  store.exec("PSETEX b 1500 v");
  expect(store.exec("TTL a")).toBe(10);
  expect(store.exec("PTTL b")).toBe(1500);
  expect(store.wal.entries.map((e) => decodeCommand(e))).toEqual([
    ["SET", "a", "v", "PXAT", "11000"],
    ["SET", "b", "v", "PXAT", "2500"],
  ]);
  clock.advance(1500);
  expect(store.exec("GET b")).toBeNull();
  expect(store.exec("GET a")).toBe("v");
});

it("uptime comes from the injected clock", () => {
  const clock = new ManualClock(5_000_000);
  const store = new Store({ clock });
  expect(store.info().uptime_ms).toBe(0);
  clock.advance(2_500);
  expect(store.info().uptime_ms).toBe(2_500);
  expect(String(store.exec("INFO"))).toContain("uptime_ms:2500");
});

it("snapshots record createdAt from the injected clock", () => {
  const clock = new ManualClock(42_000);
  const store = new Store({ clock });
  store.exec("SET k v");
  clock.advance(8_000);
  const snap = store.snapshot();
  const header = JSON.parse(snap.slice(0, snap.lastIndexOf("\n")));
  expect(header.createdAt).toBe(50_000);
  expect(Store.restore({ clock }, { snapshot: snap }).exec("GET k")).toBe("v");
});
