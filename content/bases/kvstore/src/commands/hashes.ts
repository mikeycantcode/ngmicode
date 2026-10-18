// Hash commands. Field order is insertion order (Map), which is what
// HGETALL returns.

import { KvError } from "../errors";
import type { CommandContext, CommandSpec, HashValue } from "../types";
import { parseInteger } from "../util/numbers";
import { firstKey } from "./common";

function hashForWrite(ctx: CommandContext, key: string): HashValue {
  let h = ctx.ks.writeAs(key, "hash");
  if (!h) {
    h = { type: "hash", data: new Map() } as HashValue;
    ctx.ks.set(key, h);
  }
  return h;
}

export const hashCommands: CommandSpec[] = [
  {
    name: "HSET",
    arity: -4,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [key, ...pairs]) => {
      if (pairs.length % 2 !== 0) throw new KvError("ERR wrong number of arguments for 'hset' command");
      const h = hashForWrite(ctx, key);
      let added = 0;
      for (let i = 0; i < pairs.length; i += 2) {
        if (!h.data.has(pairs[i])) added++;
        h.data.set(pairs[i], pairs[i + 1]);
      }
      ctx.ks.mutated(key);
      return added;
    },
  },
  {
    name: "HGET",
    arity: 3,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key, field]) => ctx.ks.readAs(key, "hash")?.data.get(field) ?? null,
  },
  {
    name: "HMGET",
    arity: -3,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key, ...fields]) => {
      const h = ctx.ks.readAs(key, "hash");
      return fields.map((f) => h?.data.get(f) ?? null);
    },
  },
  {
    name: "HDEL",
    arity: -3,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [key, ...fields]) => {
      const h = ctx.ks.writeAs(key, "hash");
      if (!h) return 0;
      let n = 0;
      for (const f of fields) if (h.data.delete(f)) n++;
      if (n > 0) ctx.ks.mutated(key);
      return n;
    },
  },
  {
    name: "HGETALL",
    arity: 2,
    flags: ["readonly"],
    keys: firstKey,
    handler: (ctx, [key]) => {
      const h = ctx.ks.readAs(key, "hash");
      if (!h) return [];
      const out: string[] = [];
      for (const [f, v] of h.data) out.push(f, v);
      return out;
    },
  },
  {
    name: "HLEN",
    arity: 2,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => ctx.ks.readAs(key, "hash")?.data.size ?? 0,
  },
  {
    name: "HEXISTS",
    arity: 3,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key, field]) => (ctx.ks.readAs(key, "hash")?.data.has(field) ? 1 : 0),
  },
  {
    name: "HINCRBY",
    arity: 4,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [key, field, rawDelta]) => {
      const delta = parseInteger(rawDelta);
      const h = hashForWrite(ctx, key);
      const cur = h.data.get(field);
      let base = 0;
      if (cur !== undefined) {
        try {
          base = parseInteger(cur);
        } catch {
          throw new KvError("ERR hash value is not an integer");
        }
      }
      const next = base + delta;
      if (!Number.isSafeInteger(next)) throw new KvError("ERR increment or decrement would overflow");
      h.data.set(field, String(next));
      ctx.ks.mutated(key);
      return next;
    },
  },
];
