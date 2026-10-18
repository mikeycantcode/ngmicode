import { describe, it, expect } from "testkit";
import { loadConfig } from "../src/config/config";
import { MemoryCacheStore } from "../src/cache/cache-store";
import { EventBus } from "../src/core/events";
import { ScriptExecutor } from "../src/runner/executors";
import { runTasks, type RunContext } from "../src/runner/task-runner";
import { ManualClock } from "../src/scheduler/clock";
import { sampleRepo } from "./fixtures";

function setup(overrides: Record<string, string> = {}) {
  const fs = sampleRepo(overrides);
  const clock = new ManualClock();
  const executor = new ScriptExecutor();
  const ctx: RunContext = {
    fs,
    config: loadConfig(fs),
    env: { API_URL: "https://api.acme.dev" },
    clock,
    cache: new MemoryCacheStore(),
    executor,
    bus: new EventBus({ record: true }),
  };
  return { fs, clock, executor, ctx, run: (opts: Parameters<typeof runTasks>[1]) => clock.run(runTasks(ctx, opts)) };
}

describe("runTasks", () => {
  it("builds everything in dependency order and writes outputs", async () => {
    const { fs, run } = setup();
    const s = await run({ tasks: ["build"] });
    expect(s.ok).toBe(true);
    expect(s.tasks.map((t) => t.id)).toEqual(["@acme/utils#build", "@acme/ui#build", "@acme/ui-kit#build", "@acme/docs#build", "@acme/web#build"]);
    expect(s.stats).toEqual({ total: 5, executed: 5, cached: 0, failed: 0, skipped: 0 });
    expect(fs.read("packages/ui/dist/button.js")).toContain("Button");
  });

  it("hits the cache on the second run and restores outputs", async () => {
    const { fs, run, executor } = setup();
    await run({ tasks: ["build"] });
    fs.delete("packages/ui/dist/button.js");
    const s = await run({ tasks: ["build"] });
    expect(s.stats.cached).toBe(5);
    expect(executor.executions).toBe(5);
    expect(fs.read("packages/ui/dist/button.js")).toContain("Button");
    expect(s.tasks[0].logs).toEqual(["compiled 2 file(s)"]);
  });

  it("invalidates dependents when a dependency's source changes", async () => {
    const { fs, run } = setup();
    await run({ tasks: ["build"] });
    fs.write("packages/ui/src/button.ts", "export const Button = () => 'fancy';\n");
    const s = await run({ tasks: ["build"] });
    const status = Object.fromEntries(s.tasks.map((t) => [t.id, t.status]));
    expect(status).toEqual({
      "@acme/utils#build": "cached",
      "@acme/ui#build": "executed",
      "@acme/ui-kit#build": "executed",
      "@acme/docs#build": "executed",
      "@acme/web#build": "executed",
    });
  });

  it("includes declared env vars in the hash", async () => {
    const { ctx, run } = setup();
    const a = await run({ tasks: ["build"], packages: ["@acme/web"] });
    ctx.env = { API_URL: "https://staging.acme.dev" };
    const b = await run({ tasks: ["build"], packages: ["@acme/web"] });
    expect(b.tasks.find((t) => t.id === "@acme/web#build")!.status).toBe("executed");
    expect(b.tasks.find((t) => t.id === "@acme/ui#build")!.hash).toBe(a.tasks.find((t) => t.id === "@acme/ui#build")!.hash);
  });

  it("reports failures and skips dependents", async () => {
    const { run } = setup({
      "packages/ui/package.json": JSON.stringify({ name: "@acme/ui", version: "2.1.0", dependencies: { "@acme/utils": "*" }, scripts: { build: "sleep 5 && fail type error in button.ts" } }),
    });
    const s = await run({ tasks: ["build"] });
    expect(s.ok).toBe(false);
    expect(s.stats.failed).toBe(1);
    expect(s.tasks.find((t) => t.id === "@acme/web#build")!.status).toBe("skipped");
  });

  it("honors the concurrency limit", async () => {
    const { run } = setup();
    const s = await run({ tasks: ["test"], concurrency: 1 });
    expect(s.maxConcurrency).toBe(1);
  });
});
