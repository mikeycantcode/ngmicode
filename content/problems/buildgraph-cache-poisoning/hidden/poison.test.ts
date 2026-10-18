import { it, expect } from "testkit";
import { loadConfig } from "../../src/config/config";
import { MemoryCacheStore } from "../../src/cache/cache-store";
import { EventBus } from "../../src/core/events";
import { ScriptExecutor } from "../../src/runner/executors";
import { runTasks, type RunContext } from "../../src/runner/task-runner";
import { ManualClock } from "../../src/scheduler/clock";
import { sampleRepo } from "../fixtures";

async function poisoned(paths: string[]) {
  const fs = sampleRepo();
  const clock = new ManualClock();
  const cache = new MemoryCacheStore();
  const bus = new EventBus({ record: true });
  const ctx: RunContext = { fs, config: loadConfig(fs), env: {}, clock, cache, executor: new ScriptExecutor(), bus };
  const run = () => clock.run(runTasks(ctx, { tasks: ["build"], packages: ["@acme/ui"] }));
  const first = await run();
  const hash = first.tasks.find((t) => t.id === "@acme/ui#build")!.hash;
  cache.put({ hash, taskId: "@acme/ui#build", outputs: paths.map((p) => ({ path: p, content: "pwned" })), logs: [], durationMs: 0 });
  fs.delete("packages/ui/dist/button.js");
  const rootManifest = fs.read("package.json");
  const second = await run();
  return { fs, cache, bus, run, first, second, hash, rootManifest };
}

it("rejects sibling-prefix escapes and falls back to executing", async () => {
  const { fs, bus, second } = await poisoned(["../ui-kit/dist/index.js"]);
  expect(second.ok).toBe(true);
  expect(second.tasks.find((t) => t.id === "@acme/ui#build")!.status).toBe("executed");
  expect(fs.tryRead("packages/ui-kit/dist/index.js")).toBeUndefined();
  expect(fs.read("packages/ui/dist/button.js")).toContain("Button");
  const warns = bus.of("warn");
  expect(warns.some((w) => w.id === "@acme/ui#build" && /rejected cache entry/.test(w.message))).toBe(true);
});

it("rejects the whole entry atomically, for every unsafe path shape", async () => {
  for (const bad of ["../../package.json", "../../../outside.txt", "/etc/passwd", "dist\\..\\..\\x.js", ""]) {
    const { fs, second, rootManifest } = await poisoned(["dist/ok.js", bad]);
    expect(second.ok).toBe(true);
    expect(second.tasks.find((t) => t.id === "@acme/ui#build")!.status).toBe("executed");
    expect(fs.tryRead("packages/ui/dist/ok.js")).toBeUndefined();
    expect(fs.read("package.json")).toBe(rootManifest);
    expect(fs.tryRead("packages/ui/etc/passwd")).toBeUndefined();
  }
});

it("restores harmless normalized paths and replaces poisoned entries", async () => {
  const ok = await poisoned(["dist/../dist/button.js"]);
  expect(ok.second.tasks.find((t) => t.id === "@acme/ui#build")!.status).toBe("cached");
  expect(ok.fs.read("packages/ui/dist/button.js")).toBe("pwned");

  const bad = await poisoned(["../../package.json"]);
  bad.fs.delete("packages/ui/dist/button.js");
  const third = await bad.run();
  expect(third.tasks.find((t) => t.id === "@acme/ui#build")!.status).toBe("cached");
  expect(bad.fs.read("packages/ui/dist/button.js")).toContain("Button");
});
