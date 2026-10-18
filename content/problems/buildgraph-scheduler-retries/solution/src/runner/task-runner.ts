import { computeGlobalHash, computeTaskHash, type TaskHash } from "../cache/cache-key";
import type { CacheStore } from "../cache/cache-store";
import { collectOutputs, restoreOutputs } from "../cache/outputs";
import type { BuildGraphConfig } from "../config/types";
import { EventBus } from "../core/events";
import { TaskError } from "../core/errors";
import { nullLogger, type Logger } from "../core/logger";
import { buildTaskGraph, type TaskGraph } from "../graph/task-graph";
import type { Clock } from "../scheduler/clock";
import { runSchedule } from "../scheduler/scheduler";
import type { VirtualFS } from "../vfs/vfs";
import { buildPackageGraph } from "../workspace/package-graph";
import { loadWorkspace } from "../workspace/workspace";
import type { Executor } from "./executors";

export interface RunContext {
  fs: VirtualFS;
  config: BuildGraphConfig;
  env: Record<string, string>;
  clock: Clock;
  cache: CacheStore;
  executor: Executor;
  bus?: EventBus;
  logger?: Logger;
}

export interface RunOptions {
  tasks: string[];
  /** Entry packages (default: all). Their task dependencies are always included. */
  packages?: string[];
  concurrency?: number;
  /** Ignore cache hits (results are still written to the cache). */
  force?: boolean;
  /** Keep running tasks that don't depend on a failed task. */
  continueOnError?: boolean;
}

export type TaskRunStatus = "executed" | "cached" | "failed" | "skipped";

export interface TaskRunResult {
  id: string;
  pkg: string;
  task: string;
  hash: string;
  status: TaskRunStatus;
  durationMs: number;
  logs: string[];
  error?: string;
  /** Number of times the task was attempted (0 if skipped). */
  attempts: number;
}

export interface RunSummary {
  ok: boolean;
  /** One entry per task, in topological order. */
  tasks: TaskRunResult[];
  stats: Record<TaskRunStatus, number> & { total: number };
  durationMs: number;
  maxConcurrency: number;
}

/**
 * Computes every task's hash in dependency order against the *current* filesystem.
 * Pure: no side effects on fs/cache. Note that runTasks hashes each task lazily, right
 * before it runs, because upstream tasks in the same package (e.g. build before test)
 * may change its input files.
 */
export function hashTaskGraph(ctx: Pick<RunContext, "fs" | "config" | "env">, tg: TaskGraph, order: string[]): Map<string, TaskHash> {
  const global = computeGlobalHash(ctx.fs, ctx.config, ctx.env);
  const hashes = new Map<string, TaskHash>();
  for (const id of order) {
    const deps: Record<string, string> = {};
    for (const d of tg.graph.successors(id)) deps[d] = hashes.get(d)!.hash;
    hashes.set(id, computeTaskHash(ctx.fs, tg.nodes.get(id)!, ctx.env, deps, global));
  }
  return hashes;
}

export function planTasks(ctx: Pick<RunContext, "fs" | "config">, opts: RunOptions) {
  const ws = loadWorkspace(ctx.fs);
  const pkgGraph = buildPackageGraph(ws);
  const tg = buildTaskGraph(ws, pkgGraph, ctx.config, { tasks: opts.tasks, packages: opts.packages });
  const order = tg.graph.topoSort();
  return { ws, pkgGraph, tg, order };
}

export async function runTasks(ctx: RunContext, opts: RunOptions): Promise<RunSummary> {
  const bus = ctx.bus ?? new EventBus();
  const log = ctx.logger ?? nullLogger;
  const startedAt = ctx.clock.now();
  const { tg, order } = planTasks(ctx, opts);
  const globalHash = computeGlobalHash(ctx.fs, ctx.config, ctx.env);

  const results = new Map<string, TaskRunResult>();
  for (const id of order) {
    const n = tg.nodes.get(id)!;
    results.set(id, { id, pkg: n.pkg, task: n.task, hash: "", status: "skipped", durationMs: 0, logs: [], attempts: 0 });
  }

  bus.emit("run:start", { tasks: order.length });

  const scheduled = order.map((id) => ({
    id,
    deps: tg.graph.successors(id),
    retries: tg.nodes.get(id)!.def.retries ?? 0,
    retryDelayMs: tg.nodes.get(id)!.def.retryDelayMs ?? 100,
    run: async () => {
      const node = tg.nodes.get(id)!;
      const result = results.get(id)!;
      result.attempts++;
      const depHashes: Record<string, string> = {};
      for (const d of tg.graph.successors(id)) depHashes[d] = results.get(d)!.hash;
      const { hash } = computeTaskHash(ctx.fs, node, ctx.env, depHashes, globalHash);
      result.hash = hash;
      const t0 = ctx.clock.now();
      bus.emit("task:start", { id, at: t0 });

      if (node.def.cache && !opts.force) {
        const hit = ctx.cache.get(hash);
        if (hit) {
          restoreOutputs(ctx.fs, node.dir, hit);
          result.status = "cached";
          result.logs = hit.logs;
          bus.emit("cache:hit", { id, hash });
          bus.emit("task:end", { id, at: ctx.clock.now(), status: "cached" });
          log.info(`${id}: cache hit, replaying logs (${hash})`);
          return;
        }
        bus.emit("cache:miss", { id, hash });
      }

      log.info(`${id}: running "${node.script}"`);
      const res = await ctx.executor.execute({ node, fs: ctx.fs, env: ctx.env, clock: ctx.clock });
      result.logs = res.logs;
      result.durationMs = ctx.clock.now() - t0;
      if (res.exitCode !== 0) {
        result.status = "failed";
        result.error = `exit code ${res.exitCode}`;
        bus.emit("task:end", { id, at: ctx.clock.now(), status: "failed" });
        throw new TaskError(id, res.exitCode);
      }
      result.status = "executed";
      if (node.def.cache) {
        const outputs = collectOutputs(ctx.fs, node);
        ctx.cache.put({ hash, taskId: id, outputs, logs: res.logs, durationMs: result.durationMs });
        bus.emit("cache:put", { id, hash, files: outputs.length });
      }
      bus.emit("task:end", { id, at: ctx.clock.now(), status: "executed" });
    },
  }));

  const sched = await runSchedule(scheduled, {
    concurrency: opts.concurrency ?? ctx.config.concurrency,
    clock: ctx.clock,
    bus,
    continueOnError: opts.continueOnError,
  });

  const tasks = order.map((id) => results.get(id)!);
  const stats = { total: tasks.length, executed: 0, cached: 0, failed: 0, skipped: 0 };
  for (const t of tasks) stats[t.status]++;
  const durationMs = ctx.clock.now() - startedAt;
  bus.emit("run:complete", { ok: sched.ok, durationMs });
  return { ok: sched.ok, tasks, stats, durationMs, maxConcurrency: sched.maxConcurrency };
}
