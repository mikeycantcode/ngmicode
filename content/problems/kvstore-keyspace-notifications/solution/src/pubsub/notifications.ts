// Keyspace notifications (Redis "notify-keyspace-events", K and E classes).
//
// Keys modified by a command are collected while it runs (Keyspace
// onModified hook) and published once the command has finished, named after
// the command. Expired / evicted keys are published as they happen.
// Nothing is published while the WAL is being replayed.

import type { Store } from "../store";

export const KEYSPACE_PREFIX = "__keyspace@0__:";
export const KEYEVENT_PREFIX = "__keyevent@0__:";

export class Notifier {
  private touched: string[] = [];
  private touchedSet = new Set<string>();

  constructor(private store: Store) {}

  private get flags(): string {
    return this.store.config.get("notify-keyspace-events");
  }

  private get active(): boolean {
    return this.flags !== "" && !this.store.ks.loading;
  }

  /** Records a key modified by the running command. */
  touch(key: string): void {
    if (!this.active || this.touchedSet.has(key)) return;
    this.touchedSet.add(key);
    this.touched.push(key);
  }

  /** Publishes one event per key touched by the command that just finished. */
  flush(commandName: string): void {
    const keys = this.touched;
    this.touched = [];
    this.touchedSet.clear();
    if (!this.active) return;
    const event = commandName.toLowerCase();
    for (const key of keys) this.notify(event, key);
  }

  notify(event: string, key: string): void {
    if (!this.active) return;
    const flags = this.flags;
    if (flags.includes("K")) this.store.broker.publish(KEYSPACE_PREFIX + key, event);
    if (flags.includes("E")) this.store.broker.publish(KEYEVENT_PREFIX + event, key);
  }
}
