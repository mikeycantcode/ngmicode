// String commands. Integers are stored as strings and parsed on demand
// (INCR & co.), so "10" and the result of INCR are indistinguishable.

import { KvError, SyntaxError_ } from "../errors";
import { OK } from "../protocol/reply";
import type { CommandContext, CommandSpec, Reply } from "../types";
import { formatDouble, parseFloatStrict, parseInteger } from "../util/numbers";
import { allArgs, everyOther, firstKey, isOpt, parseTtlMs } from "./common";

function getString(ctx: CommandContext, key: string): string | null {
  const v = ctx.ks.readAs(key, "string");
  return v ? v.data : null;
}

// ---------------------------------------------------------------------------
// SET key value [NX | XX] [GET] [EX s | PX ms | EXAT s | PXAT ms | KEEPTTL]
// ---------------------------------------------------------------------------

interface SetFlags {
  nx: boolean;
  xx: boolean;
  get: boolean;
  keepTtl: boolean;
  /** Absolute expiry, already resolved against the clock. */
  expiresAt: number | null;
  /** True when the TTL was given relatively (EX/PX) → must be rewritten for the WAL. */
  relative: boolean;
}

function parseSetFlags(ctx: CommandContext, args: string[]): SetFlags {
  const f: SetFlags = { nx: false, xx: false, get: false, keepTtl: false, expiresAt: null, relative: false };
  let sawExpire = false;
  for (let i = 0; i < args.length; i++) {
    const opt = args[i].toUpperCase();
    if (opt === "NX" && !f.xx) f.nx = true;
    else if (opt === "XX" && !f.nx) f.xx = true;
    else if (opt === "GET") f.get = true;
    else if (opt === "KEEPTTL" && !sawExpire) f.keepTtl = true;
    else if ((opt === "EX" || opt === "PX" || opt === "EXAT" || opt === "PXAT") && !sawExpire && !f.keepTtl) {
      const raw = args[++i];
      if (raw === undefined) throw new SyntaxError_();
      const n = parseTtlMs(raw, opt === "EX" || opt === "EXAT" ? "s" : "ms", "set");
      if (n <= 0) throw new KvError("ERR invalid expire time in 'set' command");
      sawExpire = true;
      if (opt === "EX" || opt === "PX") {
        f.expiresAt = ctx.clock.now() + n;
        f.relative = true;
      } else {
        f.expiresAt = n;
      }
    } else {
      throw new SyntaxError_();
    }
  }
  return f;
}

function setCommand(ctx: CommandContext, args: string[]): Reply {
  const [key, value, ...rest] = args;
  const f = parseSetFlags(ctx, rest);
  const existing = ctx.ks.lookupWrite(key);
  if (f.get && existing && existing.type !== "string") {
    throw new KvError("WRONGTYPE Operation against a key holding the wrong kind of value");
  }
  const old = existing?.type === "string" ? existing.data : null;

  if ((f.nx && existing) || (f.xx && !existing)) return f.get ? old : null;

  ctx.ks.set(key, { type: "string", data: value }, { expiresAt: f.expiresAt, keepTtl: f.keepTtl });
  if (f.relative) ctx.rewrite(["SET", key, value, "PXAT", String(f.expiresAt)]);
  return f.get ? old : OK;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

function incrBy(ctx: CommandContext, key: string, delta: number): Reply {
  const v = ctx.ks.writeAs(key, "string");
  const current = v ? parseInteger(v.data) : 0;
  const next = current + delta;
  if (!Number.isSafeInteger(next)) throw new KvError("ERR increment or decrement would overflow");
  if (v) {
    v.data = String(next);
    ctx.ks.mutated(key);
  } else {
    ctx.ks.set(key, { type: "string", data: String(next) });
  }
  return next;
}

function incrByFloat(ctx: CommandContext, key: string, raw: string): Reply {
  const delta = parseFloatStrict(raw);
  const v = ctx.ks.writeAs(key, "string");
  const current = v ? parseFloatStrict(v.data) : 0;
  const next = current + delta;
  if (!Number.isFinite(next)) throw new KvError("ERR increment would produce NaN or Infinity");
  const text = formatDouble(next);
  if (v) {
    v.data = text;
    ctx.ks.mutated(key);
  } else {
    ctx.ks.set(key, { type: "string", data: text });
  }
  // Float addition is not guaranteed to round-trip identically, so log the result.
  ctx.rewrite(["SET", key, text, "KEEPTTL"]);
  return text;
}

// ---------------------------------------------------------------------------
// Legacy SETEX / PSETEX (kept for old clients; SET ... EX is preferred)
// ---------------------------------------------------------------------------

function setexLike(unit: "s" | "ms", name: string) {
  return (ctx: CommandContext, [key, ttl, value]: string[]): Reply => {
    const ms = parseTtlMs(ttl, unit, name);
    if (ms <= 0) throw new KvError(`ERR invalid expire time in '${name.toLowerCase()}' command`);
    const expiresAt = ctx.clock.now() + ms;
    ctx.ks.set(key, { type: "string", data: value }, { expiresAt });
    ctx.rewrite(["SET", key, value, "PXAT", String(expiresAt)]);
    return OK;
  };
}

export const stringCommands: CommandSpec[] = [
  {
    name: "GET",
    arity: 2,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => getString(ctx, key),
  },
  {
    name: "SET",
    arity: -3,
    flags: ["write", "denyoom"],
    keys: firstKey,
    handler: setCommand,
  },
  {
    name: "SETNX",
    arity: 3,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [key, value]) => {
      if (ctx.ks.lookupWrite(key)) return 0;
      ctx.ks.set(key, { type: "string", data: value });
      return 1;
    },
  },
  {
    name: "SETEX",
    arity: 4,
    flags: ["write", "denyoom"],
    keys: firstKey,
    handler: setexLike("s", "SETEX"),
  },
  {
    name: "PSETEX",
    arity: 4,
    flags: ["write", "denyoom"],
    keys: firstKey,
    handler: setexLike("ms", "PSETEX"),
  },
  {
    name: "GETDEL",
    arity: 2,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => {
      const v = getString(ctx, key);
      if (v !== null) ctx.ks.delete(key);
      return v;
    },
  },
  {
    name: "MGET",
    arity: -2,
    flags: ["readonly", "fast"],
    keys: allArgs,
    handler: (ctx, keys) =>
      keys.map((k) => {
        const v = ctx.ks.lookupRead(k);
        return v && v.type === "string" ? v.data : null;
      }),
  },
  {
    name: "MSET",
    arity: -3,
    flags: ["write", "denyoom"],
    keys: everyOther,
    handler: (ctx, args) => {
      if (args.length % 2 !== 0) throw new KvError("ERR wrong number of arguments for 'mset' command");
      for (let i = 0; i < args.length; i += 2) ctx.ks.set(args[i], { type: "string", data: args[i + 1] });
      return OK;
    },
  },
  {
    name: "APPEND",
    arity: 3,
    flags: ["write", "denyoom"],
    keys: firstKey,
    handler: (ctx, [key, suffix]) => {
      const v = ctx.ks.writeAs(key, "string");
      if (!v) {
        ctx.ks.set(key, { type: "string", data: suffix });
        return suffix.length;
      }
      v.data += suffix;
      ctx.ks.mutated(key);
      return v.data.length;
    },
  },
  {
    name: "STRLEN",
    arity: 2,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => getString(ctx, key)?.length ?? 0,
  },
  { name: "INCR", arity: 2, flags: ["write", "denyoom", "fast"], keys: firstKey, handler: (ctx, [k]) => incrBy(ctx, k, 1) },
  { name: "DECR", arity: 2, flags: ["write", "denyoom", "fast"], keys: firstKey, handler: (ctx, [k]) => incrBy(ctx, k, -1) },
  {
    name: "INCRBY",
    arity: 3,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [k, d]) => incrBy(ctx, k, parseInteger(d)),
  },
  {
    name: "DECRBY",
    arity: 3,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [k, d]) => incrBy(ctx, k, -parseInteger(d)),
  },
  {
    name: "INCRBYFLOAT",
    arity: 3,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [k, d]) => incrByFloat(ctx, k, d),
  },
];
