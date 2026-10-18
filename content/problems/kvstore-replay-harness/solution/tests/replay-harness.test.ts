import { describe, it, expect } from "testkit";
import { replayDiff, assertReplayEquivalent } from "./helpers/replay-harness";

// Sweep: every write command, replayed 10s later, must reproduce the keyspace.
const SCENARIOS: Record<string, string[]> = {
  strings: ["SET a 1", "SET b x EX 100", "SET c y PX 50000", "SET d z PXAT 90000", "SET b x2 KEEPTTL", "APPEND a 23", "INCR n", "INCRBYFLOAT f 0.1", "MSET m1 1 m2 2", "GETDEL m1"],
  ttl: ["SET k v", "EXPIRE k 100", "SET p v", "PEXPIRE p 30000", "SET q v", "EXPIREAT q 500", "SET r v EX 5", "PERSIST r", "SET gone v", "EXPIRE gone -1"],
  lists: ["RPUSH l a b c", "LPUSH l z", "LPOP l", "RPOP l 1", "LSET l 0 Z", "PEXPIRE l 20000"],
  hashes: ["HSET h a 1 b 2", "HDEL h a", "HINCRBY h n 5", "EXPIRE h 60"],
  zsets: ["ZADD z 1 a 2 b -inf c", "ZINCRBY z 2.5 a", "ZREM z b", "PEXPIRE z 15000"],
  keys: ["SET a 1 EX 30", "RENAME a b", "SET c 2", "DEL c", "MULTI", "SET t1 1 PX 40000", "SET t2 2", "EXEC"],
  expiry: ["SET short v PX 100", "SET long v PX 100000"],
};

describe("WAL replay equivalence", () => {
  for (const [name, cmds] of Object.entries(SCENARIOS)) {
    it(`${name} replays identically 10s later`, () => {
      expect(replayDiff(cmds, { advanceMs: 10_000 })).toEqual([]);
    });
  }

  it("detects a torn log", () => {
    const diff = replayDiff(["SET a 1", "SET b 2"], { dropEntries: 1 });
    expect(diff).toEqual(["b: missing after replay"]);
    expect(() => assertReplayEquivalent(["SET a 1", "SET b 2"], { dropEntries: 1 })).toThrow("b: missing");
  });
});
