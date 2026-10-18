// Approximate memory accounting. These are not real heap sizes; they are a
// stable, cheap estimate used for the maxmemory budget and INFO used_memory.
// Changing the constants changes eviction behavior, so tests pin them.

import type { Value } from "../types";

export const ENTRY_OVERHEAD = 48;
export const LIST_ITEM_OVERHEAD = 8;
export const HASH_FIELD_OVERHEAD = 16;
export const ZSET_MEMBER_OVERHEAD = 16;

export function sizeOfValue(v: Value): number {
  switch (v.type) {
    case "string":
      return v.data.length;
    case "list": {
      let n = 0;
      for (const item of v.data) n += item.length + LIST_ITEM_OVERHEAD;
      return n;
    }
    case "hash": {
      let n = 0;
      for (const [f, val] of v.data) n += f.length + val.length + HASH_FIELD_OVERHEAD;
      return n;
    }
    case "zset": {
      let n = 0;
      for (const { member } of v.data.entries()) n += member.length + ZSET_MEMBER_OVERHEAD;
      return n;
    }
  }
}

export function entrySize(key: string, v: Value): number {
  return ENTRY_OVERHEAD + key.length + sizeOfValue(v);
}

/** Aggregates are deleted when they become empty (Redis semantics). */
export function isEmptyAggregate(v: Value): boolean {
  switch (v.type) {
    case "string":
      return false;
    case "list":
      return v.data.length === 0;
    case "hash":
      return v.data.size === 0;
    case "zset":
      return v.data.size === 0;
  }
}
