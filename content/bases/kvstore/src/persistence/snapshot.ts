// Point-in-time snapshots and WAL compaction.
//
// Snapshot format (v1): one JSON line followed by "\n" and the crc32 hex of
// that line.
//
//   {"format":"kvsnap","version":1,"createdAt":<ms>,"entries":[{k,t,v,x}...]}
//   9a3f0c1e
//
// Zset scores are stored as strings (formatDouble) because JSON has no inf.

import { SortedSet } from "../datatypes/sorted-set";
import type { Keyspace } from "../core/keyspace";
import type { Value, ValueType } from "../types";
import { crc32Hex } from "../util/checksum";
import { formatDouble, parseFloatStrict } from "../util/numbers";

export interface SnapshotEntry {
  k: string;
  t: ValueType;
  v: string | string[] | [string, string][];
  x: number | null;
}

export interface SnapshotFile {
  format: "kvsnap";
  version: 1;
  createdAt: number;
  entries: SnapshotEntry[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

export function encodeValue(v: Value): SnapshotEntry["v"] {
  switch (v.type) {
    case "string":
      return v.data;
    case "list":
      return [...v.data];
    case "hash":
      return [...v.data.entries()];
    case "zset":
      return v.data.entries().map(({ member, score }) => [member, formatDouble(score)] as [string, string]);
  }
}

export function decodeValue(t: ValueType, raw: SnapshotEntry["v"]): Value {
  switch (t) {
    case "string":
      return { type: "string", data: raw as string };
    case "list":
      return { type: "list", data: [...(raw as string[])] };
    case "hash":
      return { type: "hash", data: new Map(raw as [string, string][]) };
    case "zset": {
      const z = new SortedSet();
      for (const [m, s] of raw as [string, string][]) z.add(m, parseFloatStrict(s));
      return { type: "zset", data: z };
    }
  }
}

export function createSnapshot(ks: Keyspace, createdAt: number): string {
  const entries: SnapshotEntry[] = [];
  for (const [k, e] of ks.entries()) entries.push({ k, t: e.value.type, v: encodeValue(e.value), x: e.expiresAt });
  const file: SnapshotFile = { format: "kvsnap", version: 1, createdAt, entries };
  const body = JSON.stringify(file);
  return `${body}\n${crc32Hex(body)}`;
}

export function parseSnapshot(text: string): SnapshotFile {
  const nl = text.lastIndexOf("\n");
  if (nl === -1) throw new SnapshotError("missing checksum line");
  const body = text.slice(0, nl);
  const sum = text.slice(nl + 1).trim();
  if (crc32Hex(body) !== sum) throw new SnapshotError("checksum mismatch");
  let file: SnapshotFile;
  try {
    file = JSON.parse(body);
  } catch {
    throw new SnapshotError("invalid JSON body");
  }
  if (file.format !== "kvsnap" || file.version !== 1) throw new SnapshotError(`unsupported snapshot ${file.format}/${file.version}`);
  return file;
}

/** Loads a snapshot into an (assumed empty) keyspace. Returns keys loaded. */
export function loadSnapshot(ks: Keyspace, text: string): number {
  const file = parseSnapshot(text);
  for (const e of file.entries) ks.set(e.k, decodeValue(e.t, e.v), { expiresAt: e.x });
  return file.entries.length;
}

/**
 * Minimal command list that recreates the current keyspace (BGREWRITEAOF).
 * TTLs are emitted as absolute PEXPIREAT so the result can be replayed at
 * any later time.
 */
export function rewriteCommands(ks: Keyspace): string[][] {
  const out: string[][] = [];
  for (const [key, e] of ks.entries()) {
    const v = e.value;
    switch (v.type) {
      case "string":
        out.push(["SET", key, v.data]);
        break;
      case "list":
        out.push(["RPUSH", key, ...v.data]);
        break;
      case "hash":
        out.push(["HSET", key, ...[...v.data].flat()]);
        break;
      case "zset":
        out.push(["ZADD", key, ...v.data.entries().flatMap((i) => [formatDouble(i.score), i.member])]);
        break;
    }
    if (e.expiresAt !== null) out.push(["PEXPIREAT", key, String(e.expiresAt)]);
  }
  return out;
}

/** Plain-JS view of a value, for store.dump() and tests. */
export function plainValue(v: Value): unknown {
  switch (v.type) {
    case "string":
      return v.data;
    case "list":
      return [...v.data];
    case "hash":
      return Object.fromEntries(v.data);
    case "zset":
      return v.data.entries().map((i) => [i.member, i.score]);
  }
}
