// Replay-equivalence harness: run commands, rebuild a store from the WAL
// (optionally later in time, optionally with a torn tail), and diff the two
// keyspaces. Use it in any test that adds or changes a write command.

import { Store } from "../../src/store";
import type { DumpedEntry } from "../../src/store";
import { ManualClock } from "../../src/util/clock";

export interface ReplayDiffOptions {
  /** ManualClock start time for the original store. Default 1000. */
  startMs?: number;
  /** How long after the last command the replay happens. Default 0. */
  advanceMs?: number;
  /** Simulate a torn log: drop this many entries from the end before replaying. Default 0. */
  dropEntries?: number;
}

function show(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x));
}

function describeDiff(key: string, a: DumpedEntry | undefined, b: DumpedEntry | undefined): string | null {
  if (a && !b) return `${key}: missing after replay`;
  if (!a && b) return `${key}: unexpected after replay (${show(b)})`;
  if (!a || !b) return null;
  if (a.type !== b.type) return `${key}: type ${a.type} != ${b.type}`;
  if (show(a.value) !== show(b.value)) return `${key}: value ${show(a.value)} != ${show(b.value)}`;
  if (a.expiresAt !== b.expiresAt) return `${key}: expiresAt ${a.expiresAt} != ${b.expiresAt}`;
  return null;
}

/** Returns one human-readable line per differing key (sorted by key); [] when equivalent. */
export function replayDiff(commands: string[], opts: ReplayDiffOptions = {}): string[] {
  const clock = new ManualClock(opts.startMs ?? 1_000);
  const original = new Store({ clock });
  const session = original.connect();
  for (const cmd of commands) session.exec(cmd);
  clock.advance(opts.advanceMs ?? 0);

  const drop = opts.dropEntries ?? 0;
  const entries = original.wal.entries.slice(0, Math.max(0, original.wal.length - drop));
  const replica = Store.restore({ clock }, { wal: entries });

  const a = original.dump();
  const b = replica.dump();
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: string[] = [];
  for (const k of keys) {
    const d = describeDiff(k, a[k], b[k]);
    if (d) out.push(d);
  }
  return out;
}

/** Throws with the full diff when replay does not reproduce the keyspace. */
export function assertReplayEquivalent(commands: string[], opts: ReplayDiffOptions = {}): void {
  const diff = replayDiff(commands, opts);
  if (diff.length) throw new Error(`WAL replay diverged:\n  ${diff.join("\n  ")}`);
}
