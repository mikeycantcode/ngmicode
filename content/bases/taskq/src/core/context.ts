import type { Clock } from "../clock/clock";
import type { TaskqEmitter } from "../events/events";
import type { DeadLetterQueue } from "../queue/dead-letter";
import type { DependencyTracker } from "../queue/dependencies";
import type { Queue } from "../queue/queue";
import type { HandlerRegistry } from "../queue/registry";
import type { RepeatRegistry } from "../scheduler/repeat";
import type { Storage } from "../storage/storage";
import type { Logger } from "../utils/logger";
import type { Rng } from "../utils/rng";

/**
 * Everything a component needs to talk to the rest of the system. Built once
 * by `createTaskQ` and passed down; components must not construct their own
 * clocks / RNGs / storages (tests rely on injecting fakes here).
 */
export interface TaskqContext {
  clock: Clock;
  storage: Storage;
  events: TaskqEmitter;
  logger: Logger;
  rng: Rng;
  registry: HandlerRegistry;
  dlq: DeadLetterQueue;
  deps: DependencyTracker;
  repeats: RepeatRegistry;
  /** Look up a queue created via `taskq.queue(name)`. Throws if unknown. */
  getQueue(name: string): Queue;
  queueNames(): string[];
}
