import { it, expect } from "testkit";
import { createCli } from "../../src/cli/commands";
import { MemoryCacheStore } from "../../src/cache/cache-store";
import { ScriptExecutor } from "../../src/runner/executors";
import { ManualClock } from "../../src/scheduler/clock";
import { sampleRepo } from "../fixtures";

function setup(overrides: Record<string, string> = {}) {
  const fs = sampleRepo(overrides);
  const clock = new ManualClock();
  const cache = new MemoryCacheStore();
  const executor = new ScriptExecutor();
  const cli = createCli({ fs, clock, cache, executor, env: { API_URL: "https://api" } });
  return { fs, cache, executor, run: (argv: string[]) => clock.run(cli.run(argv)) };
}

it("reports HIT with the real hashes and does no work", async () => {
  const { fs, cache, executor, run } = setup();
  const built = await run(["build"]);
  const snapshot = JSON.stringify(fs.toRecord());
  const runs = executor.executions;
  const entries = cache.size;
  const dry = await run(["build", "--dry-run"]);
  expect(dry.exitCode).toBe(0);
  expect(dry.output.dryRun).toBe(true);
  const tasks = dry.output.tasks as any[];
  expect(tasks.map((t) => [t.id, t.hash, t.cache])).toEqual((built.output.tasks as any[]).map((t) => [t.id, t.hash, "HIT"]));
  expect(executor.executions).toBe(runs);
  expect(cache.size).toBe(entries);
  expect(JSON.stringify(fs.toRecord())).toBe(snapshot);
});

it("reports MISS downstream of a change, with dependencies", async () => {
  const { fs, run } = setup();
  await run(["build"]);
  fs.write("packages/ui/src/button.ts", "export const Button = () => 'v2';\n");
  const dry = await run(["build", "--dry-run"]);
  const tasks = dry.output.tasks as any[];
  expect(Object.fromEntries(tasks.map((t) => [t.id, t.cache]))).toEqual({
    "@acme/utils#build": "HIT",
    "@acme/ui#build": "MISS",
    "@acme/ui-kit#build": "MISS",
    "@acme/docs#build": "MISS",
    "@acme/web#build": "MISS",
  });
  expect(tasks.find((t) => t.id === "@acme/web#build").dependsOn).toEqual(["@acme/ui#build", "@acme/utils#build"]);
  expect(fs.tryRead("packages/ui/dist/button.js")).toContain("Button");
});

it("works for test with --filter and cache: false", async () => {
  const { run, executor } = setup({
    "buildgraph.json": JSON.stringify({ pipeline: { build: { dependsOn: ["^build"], outputs: ["dist/**"] }, test: { dependsOn: ["build"], cache: false } } }),
  });
  const dry = await run(["test", "--dry-run", "--filter=@acme/ui"]);
  expect((dry.output.tasks as any[]).map((t) => [t.id, t.cache])).toEqual([
    ["@acme/utils#build", "MISS"],
    ["@acme/ui#build", "MISS"],
    ["@acme/ui#test", "DISABLED"],
  ]);
  expect(executor.executions).toBe(0);
});
