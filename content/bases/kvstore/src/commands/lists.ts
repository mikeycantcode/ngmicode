// List commands. Lists are plain arrays; LPUSH is O(n) because of unshift.
// TODO(perf): switch to a ring-buffer deque if LPUSH-heavy workloads show up.

import { KvError } from "../errors";
import { OK } from "../protocol/reply";
import type { CommandContext, CommandSpec, ListValue, Reply } from "../types";
import { normalizeRange, parseInteger } from "../util/numbers";
import { firstKey } from "./common";

function push(ctx: CommandContext, key: string, values: string[], left: boolean): Reply {
  let list = ctx.ks.writeAs(key, "list");
  if (!list) {
    list = { type: "list", data: [] } as ListValue;
    ctx.ks.set(key, list);
  }
  if (left) for (const v of values) list.data.unshift(v);
  else list.data.push(...values);
  ctx.ks.mutated(key);
  return list.data.length;
}

function pop(ctx: CommandContext, key: string, countArg: string | undefined, left: boolean): Reply {
  let count: number | null = null;
  if (countArg !== undefined) {
    count = parseInteger(countArg);
    if (count < 0) throw new KvError("ERR value is out of range, must be positive");
  }
  const list = ctx.ks.writeAs(key, "list");
  if (!list) return null;
  if (count === null) {
    const v = left ? list.data.shift()! : list.data.pop()!;
    ctx.ks.mutated(key);
    return v;
  }
  const n = Math.min(count, list.data.length);
  const out = left ? list.data.splice(0, n) : list.data.splice(list.data.length - n, n).reverse();
  if (n > 0) ctx.ks.mutated(key);
  return out;
}

function normalizeIndex(raw: string, length: number): number {
  let i = parseInteger(raw);
  if (i < 0) i += length;
  return i;
}

export const listCommands: CommandSpec[] = [
  {
    name: "LPUSH",
    arity: -3,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [key, ...values]) => push(ctx, key, values, true),
  },
  {
    name: "RPUSH",
    arity: -3,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [key, ...values]) => push(ctx, key, values, false),
  },
  {
    name: "LPOP",
    arity: -2,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [key, count, ...extra]) => {
      if (extra.length) throw new KvError("ERR wrong number of arguments for 'lpop' command");
      return pop(ctx, key, count, true);
    },
  },
  {
    name: "RPOP",
    arity: -2,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [key, count, ...extra]) => {
      if (extra.length) throw new KvError("ERR wrong number of arguments for 'rpop' command");
      return pop(ctx, key, count, false);
    },
  },
  {
    name: "LLEN",
    arity: 2,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => ctx.ks.readAs(key, "list")?.data.length ?? 0,
  },
  {
    name: "LRANGE",
    arity: 4,
    flags: ["readonly"],
    keys: firstKey,
    handler: (ctx, [key, start, stop]) => {
      const s = parseInteger(start);
      const e = parseInteger(stop);
      const list = ctx.ks.readAs(key, "list");
      if (!list) return [];
      const r = normalizeRange(s, e, list.data.length);
      return r ? list.data.slice(r[0], r[1] + 1) : [];
    },
  },
  {
    name: "LINDEX",
    arity: 3,
    flags: ["readonly"],
    keys: firstKey,
    handler: (ctx, [key, index]) => {
      const list = ctx.ks.readAs(key, "list");
      if (!list) return null;
      const i = normalizeIndex(index, list.data.length);
      return i >= 0 && i < list.data.length ? list.data[i] : null;
    },
  },
  {
    name: "LSET",
    arity: 4,
    flags: ["write", "denyoom"],
    keys: firstKey,
    handler: (ctx, [key, index, value]) => {
      const list = ctx.ks.writeAs(key, "list");
      if (!list) throw new KvError("ERR no such key");
      const i = normalizeIndex(index, list.data.length);
      if (i < 0 || i >= list.data.length) throw new KvError("ERR index out of range");
      list.data[i] = value;
      ctx.ks.mutated(key);
      return OK;
    },
  },
];
