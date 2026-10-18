import { it, expect } from "testkit";
import { Store } from "../../src/store";
import { ManualClock } from "../../src/util/clock";
import { decodeCommand, encodeCommand } from "../../src/persistence/codec";
import { crc32Hex } from "../../src/util/checksum";
import { CorruptLogError } from "../../src/errors";

const v2 = (argv: string[]) => {
  const payload = encodeCommand(argv);
  return `#2 ${crc32Hex(payload)} ${payload}`;
};

it("writes every entry as a checksummed v2 frame, readable by decodeCommand", () => {
  const store = new Store({ clock: new ManualClock(0) });
  store.exec(["SET", "k", "two words\r\nand a newline"]);
  store.exec("MULTI");
  store.exec("SET a 1");
  store.exec("SET b 2");
  store.exec("EXEC");
  expect(store.wal.entries[0]).toBe(v2(["SET", "k", "two words\r\nand a newline"]));
  for (const e of store.wal.entries) expect(e.startsWith("#2 ")).toBe(true);
  expect(store.wal.entries.map((e) => decodeCommand(e)[0])).toEqual(["SET", "MULTI", "SET", "SET", "EXEC"]);
  store.exec("BGREWRITEAOF");
  expect(store.wal.length).toBeGreaterThan(0);
  for (const e of store.wal.entries) expect(e.startsWith("#2 ")).toBe(true);
  expect(decodeCommand(encodeCommand(["PING"]))).toEqual(["PING"]);
});

it("replays mixed legacy and v2 logs and reports it", () => {
  const entries = [encodeCommand(["SET", "a", "1"]), v2(["RPUSH", "l", "x", "y"]), encodeCommand(["INCR", "a"]), v2(["HSET", "h", "f", "v"])];
  const store = new Store({ clock: new ManualClock(0) });
  expect(store.replay(entries)).toEqual({ applied: 4, legacy: 2, truncatedAt: null, durableLength: 4 });
  expect(store.exec("GET a")).toBe("2");
  expect(store.exec("LRANGE l 0 -1")).toEqual(["x", "y"]);
});

it("stops at the first corrupt entry (or throws in strict mode)", () => {
  const good = [v2(["SET", "a", "1"]), v2(["SET", "b", "2"]), v2(["SET", "c", "3"])];
  const flipped = v2(["SET", "d", "4"]).replace("$1\r\n4", "$1\r\n5");
  const entries = [...good, flipped, v2(["SET", "e", "5"])];
  const store = new Store({ clock: new ManualClock(0) });
  expect(store.replay(entries)).toEqual({ applied: 3, legacy: 0, truncatedAt: 3, durableLength: 3 });
  expect(store.exec("KEYS *")).toEqual(["a", "b", "c"]);

  let caught: unknown;
  try {
    new Store({ clock: new ManualClock(0) }).replay(entries, { strict: true });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(CorruptLogError);
  expect((caught as CorruptLogError).index).toBe(3);

  const torn = [...good, v2(["SET", "z", "26"]).slice(0, 12)];
  expect(new Store({ clock: new ManualClock(0) }).replay(torn).truncatedAt).toBe(3);
  expect(() => decodeCommand(flipped)).toThrow(CorruptLogError);
});

it("restore keeps only the durable prefix, dropping a cut-off transaction", () => {
  const clock = new ManualClock(0);
  const original = new Store({ clock });
  original.exec("SET a 1");
  original.exec("MULTI");
  original.exec("SET b 2");
  original.exec("SET c 3");
  original.exec("EXEC");
  const crashed = original.wal.entries.slice(0, 3); // SET a, MULTI, SET b  — EXEC never hit the disk
  crashed.push(original.wal.entries[3].slice(0, 9)); // plus a torn fragment

  const restored = Store.restore({ clock }, { wal: crashed });
  expect(restored.recovery).toEqual({ applied: 3, legacy: 0, truncatedAt: 3, durableLength: 1 });
  expect(restored.dump()).toEqual({ a: { type: "string", value: "1", expiresAt: null } });
  expect(restored.wal.length).toBe(1);

  restored.exec("SET d 4");
  const again = Store.restore({ clock }, { wal: [...restored.wal.entries] });
  expect(again.exec("KEYS *")).toEqual(["a", "d"]);
  expect(again.recovery!.truncatedAt).toBeNull();
});
