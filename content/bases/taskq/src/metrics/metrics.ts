import type { TaskqEmitter } from "../events/events";

/** Keeps every sample; fine for tests and small deployments. */
export class Histogram {
  private values: number[] = [];
  private sorted = true;

  record(v: number): void {
    if (this.values.length && v < this.values[this.values.length - 1]) this.sorted = false;
    this.values.push(v);
  }

  get count(): number {
    return this.values.length;
  }

  /** Nearest-rank percentile, p in [0, 100]. Undefined when empty. */
  percentile(p: number): number | undefined {
    if (!this.values.length) return undefined;
    if (!this.sorted) {
      this.values.sort((a, b) => a - b);
      this.sorted = true;
    }
    const rank = Math.max(1, Math.ceil((p / 100) * this.values.length));
    return this.values[rank - 1];
  }

  max(): number | undefined {
    return this.percentile(100);
  }

  reset(): void {
    this.values = [];
    this.sorted = true;
  }
}

export interface QueueCounters {
  added: number;
  completed: number;
  failed: number;
  retried: number;
  dead: number;
  stalled: number;
}

export interface QueueMetricsSnapshot {
  counters: QueueCounters;
  duration: { count: number; p50?: number; p95?: number; max?: number };
}

const emptyCounters = (): QueueCounters => ({ added: 0, completed: 0, failed: 0, retried: 0, dead: 0, stalled: 0 });

/**
 * Derives per-queue metrics purely from lifecycle events. `failed` counts
 * terminal failures only (a failed try that will be retried counts as `retried`).
 */
export class MetricsCollector {
  private counters = new Map<string, QueueCounters>();
  private durations = new Map<string, Histogram>();
  private offs: (() => void)[] = [];

  constructor(events: TaskqEmitter) {
    this.offs.push(
      events.on("added", (p) => this.bump(p.queue, "added")),
      events.on("completed", (p) => {
        this.bump(p.queue, "completed");
        this.hist(p.queue).record(p.durationMs);
      }),
      events.on("failed", (p) => this.bump(p.queue, p.willRetry ? "retried" : "failed")),
      events.on("dead", (p) => this.bump(p.queue, "dead")),
      events.on("stalled", (p) => this.bump(p.queue, "stalled")),
    );
  }

  snapshot(queue: string): QueueMetricsSnapshot {
    const h = this.hist(queue);
    return {
      counters: { ...(this.counters.get(queue) ?? emptyCounters()) },
      duration: { count: h.count, p50: h.percentile(50), p95: h.percentile(95), max: h.max() },
    };
  }

  reset(queue?: string): void {
    if (queue) {
      this.counters.delete(queue);
      this.durations.delete(queue);
    } else {
      this.counters.clear();
      this.durations.clear();
    }
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  private bump(queue: string, key: keyof QueueCounters): void {
    let c = this.counters.get(queue);
    if (!c) this.counters.set(queue, (c = emptyCounters()));
    c[key]++;
  }

  private hist(queue: string): Histogram {
    let h = this.durations.get(queue);
    if (!h) this.durations.set(queue, (h = new Histogram()));
    return h;
  }
}
