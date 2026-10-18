import type { TaskNode } from "../graph/task-graph";
import type { Clock } from "../scheduler/clock";
import type { VirtualFS } from "../vfs/vfs";
import { join, relative } from "../utils/paths";

export interface ExecContext {
  node: TaskNode;
  fs: VirtualFS;
  env: Record<string, string>;
  clock: Clock;
}

export interface ExecResult {
  exitCode: number;
  logs: string[];
}

export interface Executor {
  execute(ctx: ExecContext): Promise<ExecResult>;
}

/**
 * Executes package scripts written in buildgraph's simulated toolchain language.
 * We don't spawn processes: scripts are `&&`-chained commands:
 *
 *   sleep <ms>                 wait on the injected clock
 *   echo <text...>             append a log line
 *   write <path> <text...>     write a file (path relative to the package dir)
 *   compile <srcDir> <outDir>  "compile" every .ts file to .js (5ms per file)
 *   fail [message...]          exit 1
 *   exit <code>
 *   noop
 */
export class ScriptExecutor implements Executor {
  /** Number of scripts executed so far — used by tests/benchmarks to count real work. */
  executions = 0;

  async execute(ctx: ExecContext): Promise<ExecResult> {
    this.executions++;
    const logs: string[] = [];
    const { node, fs, clock } = ctx;
    for (const raw of node.script.split("&&")) {
      const [cmd, ...args] = raw.trim().split(/\s+/);
      switch (cmd) {
        case "sleep":
          await clock.sleep(Number(args[0]) || 0);
          break;
        case "echo":
          logs.push(args.join(" "));
          break;
        case "write":
          fs.write(join(node.dir, args[0]), args.slice(1).join(" "));
          break;
        case "compile": {
          const src = join(node.dir, args[0] ?? "src");
          const out = join(node.dir, args[1] ?? "dist");
          const files = fs.list(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
          for (const f of files) {
            const rel = relative(src, f).replace(/\.ts$/, ".js");
            fs.write(join(out, rel), `// compiled by bg-sim\n${fs.read(f)}`);
          }
          await clock.sleep(5 * files.length);
          logs.push(`compiled ${files.length} file(s)`);
          break;
        }
        case "fail":
          logs.push(args.join(" ") || "failed");
          return { exitCode: 1, logs };
        case "exit": {
          const code = Number(args[0]) || 0;
          if (code !== 0) return { exitCode: code, logs };
          return { exitCode: 0, logs };
        }
        case "noop":
        case "":
          break;
        default:
          logs.push(`${cmd}: command not found`);
          return { exitCode: 127, logs };
      }
    }
    return { exitCode: 0, logs };
  }
}

/** Adapts a plain async function into an Executor (useful in tests and plugins). */
export function executorFrom(fn: (ctx: ExecContext) => Promise<ExecResult | void>): Executor {
  return {
    async execute(ctx) {
      return (await fn(ctx)) ?? { exitCode: 0, logs: [] };
    },
  };
}
