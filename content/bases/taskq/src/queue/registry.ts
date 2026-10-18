import { TaskqError } from "../core/errors";
import type { JobRecord } from "../core/types";
import type { JobContext } from "../worker/processor";

export type JobHandler<T = any, R = unknown> = (ctx: JobContext<T>) => Promise<R> | R;

/** Use as the job name to catch every job on a queue that has no specific handler. */
export const ANY_JOB = "*";

/** Maps (queue, job name) -> handler. */
export class HandlerRegistry {
  private handlers = new Map<string, JobHandler>();

  define(queue: string, name: string, handler: JobHandler): void {
    const key = this.key(queue, name);
    if (this.handlers.has(key)) {
      throw new TaskqError(`handler for "${name}" on queue "${queue}" is already defined`, "DUPLICATE_HANDLER");
    }
    this.handlers.set(key, handler);
  }

  /** Replace or add — used by hot-reload in the dev server. */
  redefine(queue: string, name: string, handler: JobHandler): void {
    this.handlers.set(this.key(queue, name), handler);
  }

  get(queue: string, name: string): JobHandler | undefined {
    return this.handlers.get(this.key(queue, name)) ?? this.handlers.get(this.key(queue, ANY_JOB));
  }

  resolve(job: Pick<JobRecord, "queue" | "name">): JobHandler | undefined {
    return this.get(job.queue, job.name);
  }

  private key(queue: string, name: string): string {
    return `${queue}\u0000${name}`;
  }
}
