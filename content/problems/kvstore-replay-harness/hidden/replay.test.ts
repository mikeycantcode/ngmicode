import { it, expect } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";
import { replayDiff, assertReplayEquivalent } from "../helpers/replay-harness";

function restoreLater(commands: string[], laterMs: number) {
  const clock = new ManualClock(1_000);
  const store = new Store({ clock });
  for (const c of commands) store.exec(c);
  clock.advance(laterMs);
  return Store.restore({ clock }, { wal: [...store.wal.entries] });
}

it("relative EXPIRE / PEXPIRE survive a restart with the original deadline", () => {
  const r = restoreLater(["SET a v", "EXPIRE a 10", "SET b v", "PEXPIRE b 8000"], 4_000);
  expect(r.exec("PTTL a")).toBe(6_000);
  expect(r.exec("PTTL b")).toBe(4_000);
});

it("SET ... PX survives a restart with the original deadline", () => {
  const r = restoreLater(["SET a v PX 5000", "SET b v PX 9000 NX"], 2_000);
  expect(r.exec("PTTL a")).toBe(3_000);
  expect(r.exec("PTTL b")).toBe(7_000);
});

it("the harness reports equivalence, divergence and torn logs", () => {
  const cmds = ["SET a 1", "SET b 2 PX 5000", "EXPIRE a 10", "PEXPIRE b 8000", "RPUSH l x y", "HSET h f v", "ZADD z 1 m", "INCRBYFLOAT f 0.1", "EXPIREAT l 100"];
  expect(replayDiff(cmds, { advanceMs: 3_000 })).toEqual([]);
  expect(() => assertReplayEquivalent(cmds, { advanceMs: 3_000 })).not.toThrow();
  const torn = replayDiff(["SET a 1", "SET b 2"], { dropEntries: 1 });
  expect(torn.length).toBe(1);
  expect(torn[0].startsWith("b")).toBe(true);
  expect(() => assertReplayEquivalent(["SET a 1", "SET b 2"], { dropEntries: 1 })).toThrow();
});
