// Generic keyspace commands: DEL, EXISTS, TYPE, TTL family, RENAME, KEYS, SCAN.

import { KvError, SyntaxError_ } from "../errors";
import { OK } from "../protocol/reply";
import type { CommandContext, CommandSpec, Reply, ValueType } from "../types";
import { globMatch } from "../util/glob";
import { parseInteger } from "../util/numbers";
import { msToRoundedSeconds } from "../util/time";
import { allArgs, firstKey, firstTwo, isOpt, parseTtlMs } from "./common";

const VALUE_TYPES: ValueType[] = ["string", "list", "hash", "zset"];

/**
 * Shared by EXPIRE / PEXPIRE / EXPIREAT / PEXPIREAT. Always propagates the
 * absolute form so replay is independent of when it runs. A TTL in the past
 * deletes the key immediately (and is logged as DEL).
 */
function expireGeneric(ctx: CommandContext, key: string, raw: string, unit: "s" | "ms", absolute: boolean, name: string): Reply {
  const n = parseTtlMs(raw, unit, name);
  const at = absolute ? n : ctx.clock.now() + n;
  if (!ctx.ks.lookupWrite(key)) return 0;
  if (at <= ctx.clock.now()) {
    ctx.ks.delete(key);
    ctx.rewrite(["DEL", key]);
    return 1;
  }
  ctx.ks.setExpire(key, at);
  ctx.rewrite(["PEXPIREAT", key, String(at)]);
  return 1;
}

function ttlGeneric(ctx: CommandContext, key: string, unit: "s" | "ms"): Reply {
  if (!ctx.ks.lookupRead(key)) return -2;
  const at = ctx.ks.getExpire(key);
  if (at === null || at === undefined) return -1;
  const ms = Math.max(0, at - ctx.clock.now());
  return unit === "ms" ? ms : msToRoundedSeconds(ms);
}

export const keyCommands: CommandSpec[] = [
  {
    name: "DEL",
    arity: -2,
    flags: ["write"],
    keys: allArgs,
    handler: (ctx, keys) => {
      let n = 0;
      for (const k of keys) if (ctx.ks.delete(k)) n++;
      return n;
    },
  },
  {
    name: "EXISTS",
    arity: -2,
    flags: ["readonly", "fast"],
    keys: allArgs,
    handler: (ctx, keys) => {
      let n = 0;
      for (const k of keys) {
        ctx.ks.expireIfNeeded(k);
        if (ctx.ks.has(k)) n++;
      }
      return n;
    },
  },
  {
    name: "TYPE",
    arity: 2,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => ctx.ks.lookupWrite(key)?.type ?? "none",
  },
  {
    name: "EXPIRE",
    arity: 3,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [k, t]) => expireGeneric(ctx, k, t, "s", false, "expire"),
  },
  {
    name: "PEXPIRE",
    arity: 3,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [k, t]) => expireGeneric(ctx, k, t, "ms", false, "pexpire"),
  },
  {
    name: "EXPIREAT",
    arity: 3,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [k, t]) => expireGeneric(ctx, k, t, "s", true, "expireat"),
  },
  {
    name: "PEXPIREAT",
    arity: 3,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [k, t]) => expireGeneric(ctx, k, t, "ms", true, "pexpireat"),
  },
  { name: "TTL", arity: 2, flags: ["readonly", "fast"], keys: firstKey, handler: (ctx, [k]) => ttlGeneric(ctx, k, "s") },
  { name: "PTTL", arity: 2, flags: ["readonly", "fast"], keys: firstKey, handler: (ctx, [k]) => ttlGeneric(ctx, k, "ms") },
  {
    name: "PERSIST",
    arity: 2,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => {
      if (!ctx.ks.lookupWrite(key)) return 0;
      if (ctx.ks.getExpire(key) === null) return 0;
      ctx.ks.setExpire(key, null);
      return 1;
    },
  },
  {
    name: "RENAME",
    arity: 3,
    flags: ["write"],
    keys: firstTwo,
    handler: (ctx, [src, dst]) => {
      if (!ctx.ks.rename(src, dst)) throw new KvError("ERR no such key");
      return OK;
    },
  },
  {
    name: "KEYS",
    arity: 2,
    flags: ["readonly"],
    handler: (ctx, [pattern]) => ctx.ks.keys().filter((k) => globMatch(pattern, k)).sort(),
  },
  {
    name: "SCAN",
    arity: -2,
    flags: ["readonly"],
    handler: (ctx, [cursor, ...opts]) => {
      let match: string | undefined;
      let count: number | undefined;
      let type: ValueType | undefined;
      for (let i = 0; i < opts.length; i += 2) {
        const val = opts[i + 1];
        if (val === undefined) throw new SyntaxError_();
        if (isOpt(opts[i], "MATCH")) match = val;
        else if (isOpt(opts[i], "COUNT")) {
          count = parseInteger(val);
          if (count < 1) throw new SyntaxError_();
        } else if (isOpt(opts[i], "TYPE")) {
          const t = val.toLowerCase() as ValueType;
          if (!VALUE_TYPES.includes(t)) throw new KvError(`ERR unknown type name '${val}'`);
          type = t;
        } else throw new SyntaxError_();
      }
      const [next, keys] = ctx.store.scans.scan(ctx.ks, cursor, { match, count, type });
      return [next, keys];
    },
  },
  {
    name: "DBSIZE",
    arity: 1,
    flags: ["readonly", "fast"],
    handler: (ctx) => ctx.ks.size,
  },
];
