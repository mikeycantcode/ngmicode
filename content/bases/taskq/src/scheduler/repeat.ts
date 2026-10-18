import type { Clock } from "../clock/clock";
import { InvalidJobOptionsError } from "../core/errors";
import type { JobOptions } from "../core/types";
import { nextRun, parseCron, type CronSchedule } from "./cron";

export interface RepeatSpec<T = unknown> {
  /** Stable identity. Defaults to `<queue>:<name>:<cron|every>`. */
  key?: string;
  queue: string;
  name: string;
  data: T;
  /** Exactly one of `cron` / `every`. */
  cron?: string;
  every?: number;
  /** Stop after this many occurrences. */
  limit?: number;
  opts?: Omit<JobOptions, "jobId" | "delay" | "dependsOn">;
}

export interface RepeatEntry {
  key: string;
  spec: RepeatSpec;
  schedule?: CronSchedule;
  nextAt: number;
  count: number;
}

export interface Occurrence {
  key: string;
  spec: RepeatSpec;
  runAt: number;
  /** Deterministic id so a double tick can't enqueue the same occurrence twice. */
  jobId: string;
}

/**
 * Repeatable job definitions. The scheduler asks for due occurrences on each
 * tick. Missed occurrences (e.g. the process was down) are skipped: we
 * enqueue at most one per key per tick and then jump to the next future time.
 */
export class RepeatRegistry {
  private entries = new Map<string, RepeatEntry>();
  /** Set by the scheduler so it can re-arm its timer. */
  onChange?: () => void;

  constructor(private readonly clock: Clock) {}

  upsert(spec: RepeatSpec): RepeatEntry {
    if ((spec.cron === undefined) === (spec.every === undefined)) {
      throw new InvalidJobOptionsError("repeat needs exactly one of `cron` or `every`");
    }
    if (spec.every !== undefined && !(spec.every > 0)) throw new InvalidJobOptionsError("repeat.every must be > 0");
    if (spec.limit !== undefined && !(spec.limit >= 1)) throw new InvalidJobOptionsError("repeat.limit must be >= 1");
    const key = spec.key ?? `${spec.queue}:${spec.name}:${spec.cron ?? spec.every}`;
    const now = this.clock.now();
    const schedule = spec.cron !== undefined ? parseCron(spec.cron) : undefined;
    const entry: RepeatEntry = {
      key,
      spec: { ...spec, key },
      schedule,
      nextAt: schedule ? nextRun(schedule, now) : now + spec.every!,
      count: 0,
    };
    this.entries.set(key, entry);
    this.onChange?.();
    return entry;
  }

  remove(key: string): boolean {
    const had = this.entries.delete(key);
    if (had) this.onChange?.();
    return had;
  }

  get(key: string): RepeatEntry | undefined {
    return this.entries.get(key);
  }

  list(queue?: string): RepeatEntry[] {
    const all = [...this.entries.values()];
    return queue ? all.filter((e) => e.spec.queue === queue) : all;
  }

  nextAt(): number | undefined {
    let min: number | undefined;
    for (const e of this.entries.values()) if (min === undefined || e.nextAt < min) min = e.nextAt;
    return min;
  }

  takeDue(now: number): Occurrence[] {
    const out: Occurrence[] = [];
    for (const e of [...this.entries.values()]) {
      if (e.nextAt > now) continue;
      out.push({ key: e.key, spec: e.spec, runAt: e.nextAt, jobId: `repeat:${e.key}:${e.nextAt}` });
      e.count++;
      if (e.spec.limit !== undefined && e.count >= e.spec.limit) {
        this.entries.delete(e.key);
        continue;
      }
      if (e.schedule) {
        e.nextAt = nextRun(e.schedule, now);
      } else {
        const every = e.spec.every!;
        e.nextAt += every * (Math.floor((now - e.nextAt) / every) + 1);
      }
    }
    return out;
  }
}
