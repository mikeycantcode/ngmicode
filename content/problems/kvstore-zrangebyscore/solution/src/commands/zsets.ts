// Sorted set commands.

import { KvError, SyntaxError_ } from "../errors";
import { SortedSet } from "../datatypes/sorted-set";
import type { CommandContext, CommandSpec, Reply, ZSetValue } from "../types";
import { formatDouble, normalizeRange, parseFloatStrict, parseInteger } from "../util/numbers";
import { firstKey, isOpt } from "./common";

export interface ScoreBound {
  value: number;
  exclusive: boolean;
}

/**
 * Parses a score range endpoint: "1.5", "(1.5" (exclusive), "-inf", "+inf".
 * Used by ZCOUNT.
 */
export function parseScoreBound(raw: string): ScoreBound {
  const exclusive = raw.startsWith("(");
  const body = exclusive ? raw.slice(1) : raw;
  try {
    return { value: parseFloatStrict(body), exclusive };
  } catch {
    throw new KvError("ERR min or max is not a float");
  }
}

export function aboveMin(score: number, min: ScoreBound): boolean {
  return min.exclusive ? score > min.value : score >= min.value;
}

export function belowMax(score: number, max: ScoreBound): boolean {
  return max.exclusive ? score < max.value : score <= max.value;
}

function zsetForWrite(ctx: CommandContext, key: string): ZSetValue {
  let z = ctx.ks.writeAs(key, "zset");
  if (!z) {
    z = { type: "zset", data: new SortedSet() } as ZSetValue;
    ctx.ks.set(key, z);
  }
  return z;
}

/** ZADD key [NX|XX] [CH] score member [score member ...] */
function zadd(ctx: CommandContext, args: string[]): Reply {
  const key = args[0];
  let i = 1;
  let nx = false;
  let xx = false;
  let ch = false;
  for (; i < args.length; i++) {
    if (isOpt(args[i], "NX")) nx = true;
    else if (isOpt(args[i], "XX")) xx = true;
    else if (isOpt(args[i], "CH")) ch = true;
    else break;
  }
  if (nx && xx) throw new KvError("ERR XX and NX options at the same time are not compatible");
  const rest = args.slice(i);
  if (rest.length === 0 || rest.length % 2 !== 0) throw new SyntaxError_();

  // Validate everything before touching the keyspace (all-or-nothing).
  const pairs: [number, string][] = [];
  for (let j = 0; j < rest.length; j += 2) pairs.push([parseFloatStrict(rest[j]), rest[j + 1]]);

  const existing = ctx.ks.writeAs(key, "zset");
  if (!existing && xx) return 0;
  const z = existing ?? zsetForWrite(ctx, key);

  let added = 0;
  let changed = 0;
  for (const [score, member] of pairs) {
    const has = z.data.score(member) !== undefined;
    if ((nx && has) || (xx && !has)) continue;
    const r = z.data.add(member, score);
    if (r === "added") added++;
    if (r !== "unchanged") changed++;
  }
  if (changed > 0) ctx.ks.mutated(key);
  return ch ? changed : added;
}

function withScores(items: { member: string; score: number }[], scores: boolean): string[] {
  const out: string[] = [];
  for (const it of items) {
    out.push(it.member);
    if (scores) out.push(formatDouble(it.score));
  }
  return out;
}

/** ZRANGEBYSCORE key min max [WITHSCORES] [LIMIT offset count] — O(log n + m). */
function zrangeByScore(ctx: CommandContext, args: string[]): Reply {
  const [key, rawMin, rawMax, ...opts] = args;
  const min = parseScoreBound(rawMin);
  const max = parseScoreBound(rawMax);
  let scores = false;
  let offset = 0;
  let count = -1;
  for (let i = 0; i < opts.length; i++) {
    if (isOpt(opts[i], "WITHSCORES")) scores = true;
    else if (isOpt(opts[i], "LIMIT")) {
      if (opts[i + 1] === undefined || opts[i + 2] === undefined) throw new SyntaxError_();
      offset = parseInteger(opts[i + 1]);
      count = parseInteger(opts[i + 2]);
      i += 2;
    } else throw new SyntaxError_();
  }
  const z = ctx.ks.readAs(key, "zset");
  if (!z || offset < 0) return [];

  // First index with score >= min ("" sorts before every member).
  let i = z.data.lowerBound({ score: min.value, member: "" });
  if (min.exclusive) {
    while (i < z.data.size && z.data.at(i)!.score === min.value) i++;
  }
  i += offset;
  const out: { member: string; score: number }[] = [];
  for (; i < z.data.size && (count < 0 || out.length < count); i++) {
    const it = z.data.at(i)!;
    if (!belowMax(it.score, max)) break;
    out.push(it);
  }
  return withScores(out, scores);
}

export const zsetCommands: CommandSpec[] = [
  { name: "ZADD", arity: -4, flags: ["write", "denyoom", "fast"], keys: firstKey, handler: zadd },
  {
    name: "ZREM",
    arity: -3,
    flags: ["write", "fast"],
    keys: firstKey,
    handler: (ctx, [key, ...members]) => {
      const z = ctx.ks.writeAs(key, "zset");
      if (!z) return 0;
      let n = 0;
      for (const m of members) if (z.data.remove(m)) n++;
      if (n > 0) ctx.ks.mutated(key);
      return n;
    },
  },
  {
    name: "ZSCORE",
    arity: 3,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key, member]) => {
      const s = ctx.ks.readAs(key, "zset")?.data.score(member);
      return s === undefined ? null : formatDouble(s);
    },
  },
  {
    name: "ZINCRBY",
    arity: 4,
    flags: ["write", "denyoom", "fast"],
    keys: firstKey,
    handler: (ctx, [key, rawDelta, member]) => {
      const delta = parseFloatStrict(rawDelta);
      const z = zsetForWrite(ctx, key);
      const next = (z.data.score(member) ?? 0) + delta;
      if (Number.isNaN(next)) throw new KvError("ERR resulting score is not a number (NaN)");
      z.data.add(member, next);
      ctx.ks.mutated(key);
      ctx.rewrite(["ZADD", key, formatDouble(next), member]);
      return formatDouble(next);
    },
  },
  {
    name: "ZCARD",
    arity: 2,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key]) => ctx.ks.readAs(key, "zset")?.data.size ?? 0,
  },
  {
    name: "ZRANK",
    arity: 3,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key, member]) => ctx.ks.readAs(key, "zset")?.data.rank(member) ?? null,
  },
  {
    name: "ZRANGE",
    arity: -4,
    flags: ["readonly"],
    keys: firstKey,
    handler: (ctx, [key, start, stop, ...opts]) => {
      const s = parseInteger(start);
      const e = parseInteger(stop);
      let scores = false;
      for (const o of opts) {
        if (isOpt(o, "WITHSCORES")) scores = true;
        else throw new SyntaxError_();
      }
      const z = ctx.ks.readAs(key, "zset");
      if (!z) return [];
      const r = normalizeRange(s, e, z.data.size);
      return r ? withScores(z.data.range(r[0], r[1]), scores) : [];
    },
  },
  { name: "ZRANGEBYSCORE", arity: -4, flags: ["readonly"], keys: firstKey, handler: zrangeByScore },
  {
    name: "ZCOUNT",
    arity: 4,
    flags: ["readonly", "fast"],
    keys: firstKey,
    handler: (ctx, [key, rawMin, rawMax]) => {
      const min = parseScoreBound(rawMin);
      const max = parseScoreBound(rawMax);
      const z = ctx.ks.readAs(key, "zset");
      if (!z) return 0;
      let n = 0;
      for (const it of z.data.entries()) if (aboveMin(it.score, min) && belowMax(it.score, max)) n++;
      return n;
    },
  },
];
