import { describe, it, expect, beforeEach } from "testkit";
import { Store } from "../src/store";
import { ManualClock } from "../src/util/clock";
import { ErrorReply } from "../src/types";
import { tokenize } from "../src/protocol/tokenizer";
import { globMatch } from "../src/util/glob";

let store: Store;
const run = (line: string) => store.exec(line);

beforeEach(() => {
  store = new Store({ clock: new ManualClock(1_000) });
});

describe("tokenizer", () => {
  it("splits on whitespace and honours quotes", () => {
    expect(tokenize(`SET greeting "hello world"`)).toEqual(["SET", "greeting", "hello world"]);
    expect(tokenize(`SET k 'it\\'s'`)).toEqual(["SET", "k", "it's"]);
    expect(tokenize(`SET k "a\\nb\\x41"`)).toEqual(["SET", "k", "a\nbA"]);
  });

  it("rejects unbalanced quotes", () => {
    expect(() => tokenize(`SET k "oops`)).toThrow("unbalanced quotes");
    expect(run(`SET k "a"b`)).toBeInstanceOf(ErrorReply);
  });
});

describe("glob", () => {
  it("matches * and ?", () => {
    expect(globMatch("user:*", "user:42")).toBe(true);
    expect(globMatch("user:?", "user:42")).toBe(false);
    expect(globMatch("*:*:x", "a:b:x")).toBe(true);
    expect(globMatch("a.b", "aXb")).toBe(false);
  });
});

describe("strings", () => {
  it("GET/SET/APPEND/STRLEN", () => {
    expect(run("GET missing")).toBeNull();
    expect(run("SET k hello")).toBe("OK");
    expect(run("APPEND k _world")).toBe(11);
    expect(run("GET k")).toBe("hello_world");
    expect(run("STRLEN k")).toBe(11);
  });

  it("SET NX / XX / GET", () => {
    expect(run("SET k v1 NX")).toBe("OK");
    expect(run("SET k v2 NX")).toBeNull();
    expect(run("SET other v XX")).toBeNull();
    expect(run("SET k v3 XX GET")).toBe("v1");
    expect(run("GET k")).toBe("v3");
    expect((run("SET k v NX XX") as ErrorReply).message).toBe("ERR syntax error");
  });

  it("INCR family", () => {
    expect(run("INCR c")).toBe(1);
    expect(run("INCRBY c 41")).toBe(42);
    expect(run("DECRBY c 2")).toBe(40);
    expect(run("INCRBYFLOAT c 0.5")).toBe("40.5");
    run("SET s abc");
    expect((run("INCR s") as ErrorReply).message).toBe("ERR value is not an integer or out of range");
  });

  it("MSET / MGET / GETDEL", () => {
    expect(run("MSET a 1 b 2")).toBe("OK");
    expect(run("MGET a b nope")).toEqual(["1", "2", null]);
    expect(run("GETDEL a")).toBe("1");
    expect(run("EXISTS a b")).toBe(1);
  });

  it("WRONGTYPE", () => {
    run("RPUSH l x");
    expect((run("GET l") as ErrorReply).message).toMatch(/^WRONGTYPE/);
  });

  it("unknown command and arity errors", () => {
    expect((run("NOPE") as ErrorReply).message).toBe("ERR unknown command 'NOPE'");
    expect((run("GET") as ErrorReply).message).toBe("ERR wrong number of arguments for 'get' command");
  });
});

describe("lists", () => {
  it("push/pop/range", () => {
    expect(run("RPUSH l a b c")).toBe(3);
    expect(run("LPUSH l z")).toBe(4);
    expect(run("LRANGE l 0 -1")).toEqual(["z", "a", "b", "c"]);
    expect(run("LRANGE l -2 100")).toEqual(["b", "c"]);
    expect(run("LINDEX l -1")).toBe("c");
    expect(run("LPOP l")).toBe("z");
    expect(run("RPOP l 2")).toEqual(["c", "b"]);
    expect(run("LLEN l")).toBe(1);
  });

  it("deletes the key when the list becomes empty", () => {
    run("RPUSH l only");
    run("LPOP l");
    expect(run("EXISTS l")).toBe(0);
    expect(run("TYPE l")).toBe("none");
  });
});

describe("hashes", () => {
  it("HSET/HGET/HGETALL/HDEL", () => {
    expect(run("HSET h f1 v1 f2 v2")).toBe(2);
    expect(run("HSET h f1 v1b")).toBe(0);
    expect(run("HGETALL h")).toEqual(["f1", "v1b", "f2", "v2"]);
    expect(run("HINCRBY h n 5")).toBe(5);
    expect(run("HDEL h f1 f2 n")).toBe(3);
    expect(run("EXISTS h")).toBe(0);
  });
});

describe("sorted sets", () => {
  it("orders by score then member", () => {
    expect(run("ZADD z 2 b 1 a 2 a2 1.5 c")).toBe(4);
    expect(run("ZRANGE z 0 -1")).toEqual(["a", "c", "a2", "b"]);
    expect(run("ZRANGE z 0 1 WITHSCORES")).toEqual(["a", "1", "c", "1.5"]);
    expect(run("ZRANK z b")).toBe(3);
    expect(run("ZSCORE z c")).toBe("1.5");
  });

  it("ZADD flags, ZINCRBY, ZCOUNT", () => {
    run("ZADD z 1 a 2 b 3 c");
    expect(run("ZADD z NX 10 a 4 d")).toBe(1);
    expect(run("ZADD z XX CH 10 a 5 e")).toBe(1);
    expect(run("ZINCRBY z 0.5 b")).toBe("2.5");
    expect(run("ZCOUNT z (2.5 +inf")).toBe(3);
    expect(run("ZCOUNT z -inf 2.5")).toBe(1);
    expect((run("ZCOUNT z x 1") as ErrorReply).message).toBe("ERR min or max is not a float");
  });

  it("removes empty zsets", () => {
    run("ZADD z 1 a");
    expect(run("ZREM z a nope")).toBe(1);
    expect(run("EXISTS z")).toBe(0);
  });
});
