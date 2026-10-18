import { findAffected } from "../affected/affected";
import { FsCacheStore, type CacheStore } from "../cache/cache-store";
import { loadConfig } from "../config/config";
import type { BuildGraphConfig, DeepPartial } from "../config/types";
import { BuildGraphError } from "../core/errors";
import { EventBus } from "../core/events";
import { MemoryLogger } from "../core/logger";
import { buildTaskGraph } from "../graph/task-graph";
import { LOCKFILE_NAME, parseLockfile, serializeLockfile } from "../resolver/lockfile";
import type { Registry } from "../resolver/registry";
import { resolveDependencies } from "../resolver/resolver";
import { ScriptExecutor, type Executor } from "../runner/executors";
import { runTasks, type RunSummary } from "../runner/task-runner";
import { systemClock, type Clock } from "../scheduler/clock";
import type { VirtualFS } from "../vfs/vfs";
import { buildPackageGraph } from "../workspace/package-graph";
import { loadWorkspace } from "../workspace/workspace";
import { flagInt, flagList, parseArgs, type ParsedArgs } from "./args";
import { formatAffected, formatLayers, formatRunSummary } from "./format";

export interface CliContext {
  fs: VirtualFS;
  env?: Record<string, string>;
  clock?: Clock;
  /** Defaults to an FsCacheStore under config.cacheDir. */
  cache?: CacheStore;
  executor?: Executor;
  registry?: Registry;
  bus?: EventBus;
}

export interface CliResult {
  exitCode: number;
  /** Machine-readable result (what `--json` prints). */
  output: Record<string, unknown>;
  /** Human-readable rendering. */
  text: string;
}

type Command = (args: ParsedArgs) => Promise<CliResult>;

export function createCli(ctx: CliContext) {
  const env = ctx.env ?? {};
  const clock = ctx.clock ?? systemClock;
  const bus = ctx.bus ?? new EventBus();
  const executor = ctx.executor ?? new ScriptExecutor();

  const config = (overrides: DeepPartial<BuildGraphConfig> = {}) => loadConfig(ctx.fs, overrides);
  const cacheFor = (cfg: BuildGraphConfig) => ctx.cache ?? new FsCacheStore(ctx.fs, cfg.cacheDir);

  const runOutput = (command: string, summary: RunSummary): CliResult => ({
    exitCode: summary.ok ? 0 : 1,
    output: {
      command,
      ok: summary.ok,
      tasks: summary.tasks.map((t) => ({ id: t.id, status: t.status, hash: t.hash, durationMs: t.durationMs })),
      stats: summary.stats,
      durationMs: summary.durationMs,
    },
    text: formatRunSummary(summary),
  });

  const commands: Record<string, Command> = {
    async build(args) {
      const concurrency = flagInt(args.flags.concurrency);
      if (Number.isNaN(concurrency)) throw usage("--concurrency must be an integer");
      const cfg = config(concurrency ? { concurrency } : {});
      const logger = new MemoryLogger(cfg.logLevel);
      const filter = flagList(args.flags.filter);
      const summary = await runTasks(
        { fs: ctx.fs, config: cfg, env, clock, cache: cacheFor(cfg), executor, bus, logger },
        { tasks: ["build"], packages: filter.length ? filter : undefined, force: args.flags.force === true, continueOnError: args.flags.continue === true },
      );
      return runOutput("build", summary);
    },

    // NOTE: kept separate from build because test used to support --watch (removed in 0.6).
    async test(args) {
      const concurrency = flagInt(args.flags.concurrency);
      if (Number.isNaN(concurrency)) throw usage("--concurrency must be an integer");
      const cfg = config(concurrency ? { concurrency } : {});
      const logger = new MemoryLogger(cfg.logLevel);
      const filter = flagList(args.flags.filter);
      const summary = await runTasks(
        { fs: ctx.fs, config: cfg, env, clock, cache: cacheFor(cfg), executor, bus, logger },
        { tasks: ["test"], packages: filter.length ? filter : undefined, force: args.flags.force === true, continueOnError: args.flags.continue === true },
      );
      return runOutput("test", summary);
    },

    async graph(args) {
      const cfg = config();
      const ws = loadWorkspace(ctx.fs);
      const pkgGraph = buildPackageGraph(ws);
      const task = typeof args.flags.task === "string" ? args.flags.task : undefined;
      if (!task) {
        const layers = pkgGraph.layers();
        return {
          exitCode: 0,
          output: { command: "graph", nodes: pkgGraph.nodes(), edges: pkgGraph.edges(), layers },
          text: formatLayers(layers),
        };
      }
      const tg = buildTaskGraph(ws, pkgGraph, cfg, { tasks: [task] });
      const layers = tg.graph.layers();
      return {
        exitCode: 0,
        output: { command: "graph", task, nodes: tg.graph.nodes(), edges: tg.graph.edges(), layers },
        text: formatLayers(layers),
      };
    },

    async affected(args) {
      const cfg = config();
      const ws = loadWorkspace(ctx.fs);
      const files = [...flagList(args.flags.files), ...args.positionals];
      const r = findAffected(ws, buildPackageGraph(ws), files, { globalDependencies: cfg.globalDependencies });
      return { exitCode: 0, output: { command: "affected", ...r }, text: formatAffected(r) };
    },

    async install(args) {
      if (!ctx.registry) throw usage("install requires a registry");
      const ws = loadWorkspace(ctx.fs);
      const prevText = ctx.fs.tryRead(LOCKFILE_NAME);
      const prev = prevText === undefined ? undefined : parseLockfile(prevText);
      const r = resolveDependencies(ws, ctx.registry, { lockfile: prev, frozen: args.flags.frozen === true });
      const text = serializeLockfile(r.lockfile);
      if (text !== prevText) ctx.fs.write(LOCKFILE_NAME, text);
      return {
        exitCode: 0,
        output: { command: "install", resolved: r.resolved, reused: r.reused, changed: text !== prevText },
        text: `resolved ${r.resolved.length}, reused ${r.reused.length}`,
      };
    },
  };

  return {
    async run(argv: string[]): Promise<CliResult> {
      const args = parseArgs(argv);
      const cmd = commands[args.command];
      if (!cmd) {
        return errorResult(new BuildGraphError("E_USAGE", `Unknown command "${args.command}". Try: ${Object.keys(commands).join(", ")}`), 2);
      }
      try {
        return await cmd(args);
      } catch (e) {
        if (e instanceof BuildGraphError) return errorResult(e, e.code === "E_USAGE" ? 2 : 1);
        throw e;
      }
    },
  };
}

function usage(message: string) {
  return new BuildGraphError("E_USAGE", message);
}

function errorResult(e: BuildGraphError, exitCode: number): CliResult {
  return {
    exitCode,
    output: { ok: false, error: { code: e.code, message: e.message } },
    text: `error: ${e.message}`,
  };
}
