// Server counters surfaced through INFO / store.info().

import type { Clock } from "../util/clock";

export class Stats {
  commandsProcessed = 0;
  keyspaceHits = 0;
  keyspaceMisses = 0;
  expiredKeys = 0;
  evictedKeys = 0;
  rejectedCommands = 0;
  readonly startedAt: number;

  constructor(private clock: Clock) {
    this.startedAt = clock.now();
  }

  countCommand(_name: string): void {
    // TODO: per-command call counts (INFO commandstats)
    this.commandsProcessed++;
  }

  uptimeMs(): number {
    return this.clock.now() - this.startedAt;
  }

  reset(): void {
    this.commandsProcessed = 0;
    this.keyspaceHits = 0;
    this.keyspaceMisses = 0;
    this.expiredKeys = 0;
    this.evictedKeys = 0;
    this.rejectedCommands = 0;
  }
}
