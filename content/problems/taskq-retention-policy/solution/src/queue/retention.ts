import type { TaskqContext } from "../core/context";
import type { JobRecord } from "../core/types";

/**
 * Apply a removeOnComplete / removeOnFail policy after `job` reached a
 * terminal state (job.state is "completed" or "failed").
 *
 *   false / undefined  keep everything
 *   true / 0           remove `job` itself
 *   N > 0              keep the N most recent jobs of the queue in that state
 *                      (finishedAt desc, then seq desc); remove the others
 *
 * Never removes a job that is in the DLQ or that still has a blocked dependent.
 * Emits `removed` for each removal, oldest first.
 */
export async function applyRetention(ctx: TaskqContext, job: JobRecord, policy: boolean | number | undefined): Promise<void> {
  if (policy === undefined || policy === false) return;
  const { storage } = ctx;
  let victims: JobRecord[];
  if (policy === true || policy === 0) {
    victims = [job];
  } else {
    const all = await storage.listByState(job.queue, job.state);
    all.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || b.seq - a.seq);
    victims = all.slice(policy).reverse();
  }
  for (const v of victims) {
    if (await isProtected(ctx, v)) continue;
    const current = await storage.get(v.id);
    if (!current || current.state !== job.state) continue;
    await storage.remove(v.id);
    ctx.events.emit("removed", { queue: v.queue, jobId: v.id, prevState: v.state });
  }
}

async function isProtected(ctx: TaskqContext, job: JobRecord): Promise<boolean> {
  if (ctx.dlq.has(job.id)) return true;
  const current = await ctx.storage.get(job.id);
  for (const childId of current?.dependents ?? []) {
    const child = await ctx.storage.get(childId);
    if (child?.state === "blocked") return true;
  }
  return false;
}
