// Server counters surfaced through INFO / store.info().

import { nowMs } from "../util/time";

export class Stats {
  commandsProcessed = 0;
  keyspaceHits = 0;
  keyspaceMisses = 0;
  expiredKeys = 0;
  evictedKeys = 0;
  rejectedCommands = 0;
  readonly startedAt = nowMs();

  countCommand(_name: string): void {
    // TODO: per-command call counts (INFO commandstats)
    this.commandsProcessed++;
  }

  uptimeMs(): number {
    return nowMs() - this.startedAt;
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
