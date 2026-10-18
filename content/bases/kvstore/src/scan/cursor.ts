// SCAN cursors.
//
// Guarantee (same as Redis): a key that exists for the whole duration of a
// full iteration is returned exactly once; keys added or removed during the
// iteration may or may not be returned.
//
// Implementation: iterate keys in sorted order and remember, per cursor id,
// the last key examined. Cursor ids are opaque decimal strings; "0" starts
// and ends an iteration.

import { KvError } from "../errors";
import type { Keyspace } from "../core/keyspace";
import type { ValueType } from "../types";
import { globMatch } from "../util/glob";

const MAX_OPEN_CURSORS = 1024;

export interface ScanOptions {
  match?: string;
  /** Number of keys to *examine* (not return) per call. */
  count?: number;
  type?: ValueType;
}

export class ScanCursors {
  private open = new Map<string, string>();
  private nextId = 1;

  scan(ks: Keyspace, cursor: string, opts: ScanOptions = {}): [string, string[]] {
    let after: string | null = null;
    if (cursor !== "0") {
      const last = this.open.get(cursor);
      if (last === undefined) throw new KvError("ERR invalid cursor");
      this.open.delete(cursor);
      after = last;
    }

    const count = opts.count ?? 10;
    // FIXME: sorting the whole keyspace on every call is O(n log n) per page.
    const keys = ks.keys().sort();
    let i = 0;
    if (after !== null) {
      while (i < keys.length && keys[i] <= after) i++;
    }

    const out: string[] = [];
    let examined = 0;
    let lastExamined: string | null = null;
    for (; i < keys.length && examined < count; i++, examined++) {
      const key = keys[i];
      lastExamined = key;
      if (opts.match !== undefined && !globMatch(opts.match, key)) continue;
      if (opts.type !== undefined && ks.peek(key)?.value.type !== opts.type) continue;
      out.push(key);
    }

    if (i >= keys.length || lastExamined === null) return ["0", out];
    const id = String(this.nextId++);
    this.open.set(id, lastExamined);
    if (this.open.size > MAX_OPEN_CURSORS) {
      const oldest = this.open.keys().next().value as string;
      this.open.delete(oldest);
    }
    return [id, out];
  }
}
