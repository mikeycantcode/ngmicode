import { it, expect } from "testkit";
import { loadConfig } from "../../src/config/config";
import { MemoryCacheStore, type CacheEntry } from "../../src/cache/cache-store";
import { EventBus } from "../../src/core/events";
import { ScriptExecutor } from "../../src/runner/executors";
import { runTasks } from "../../src/runner/task-runner";
import { ManualClock } from "../../src/scheduler/clock";
import { createCli } from "../../src/cli/commands";
import { sampleRepo } from "../fixtures";

class FakeRemote {
  entries = new Map<string, CacheEntry>();
  gets = 0;
  puts = 0;
  constructor(private clock: ManualClock, private latency = 20, private failing = false, private putLatency = latency) {}
  async get(hash: string) {
    this.gets++;
    await this.clock.sleep(this.latency);
    if (this.failing) throw new Error("503 from remote");
    const e = this.entries.get(hash);
    return e && (JSON.parse(JSON.stringify(e)) as CacheEntry);
  }
  async put(entry: CacheEntry) {
    this.puts++;
    await this.clock.sleep(this.putLatency);
    if (this.failing) throw new Error("503 from remote");
    this.entries.set(entry.hash, JSON.parse(JSON.stringify(entry)));
  }
}

function machine(clock: ManualClock, remote: FakeRemote, files: Record<string, string> = {}) {
  const fs = sampleRepo(files);
  const local = new MemoryCacheStore();
  const bus = new EventBus({ record: true });
  const ctx: any = { fs, config: loadConfig(fs), env: {}, clock, cache: local, executor: new ScriptExecutor(), bus, remoteCache: remote };
  return { fs, local, bus, run: () => clock.run(runTasks(ctx, { tasks: ["build"] })) };
}

it("serves a fresh machine from the remote and backfills local", async () => {
  const clock = new ManualClock();
  const remote = new FakeRemote(clock);
  await machine(clock, remote).run();
  expect(remote.entries.size).toBe(5);
  const b = machine(clock, remote);
  const s = await b.run();
  expect(s.tasks.map((t: any) => [t.status, t.cacheSource])).toEqual(Array(5).fill(["cached", "remote"]));
  expect(b.fs.read("packages/ui/dist/button.js")).toContain("Button");
  expect(b.local.size).toBe(5);
  const again = await b.run();
  expect(again.tasks.map((t: any) => t.cacheSource)).toEqual(Array(5).fill("local"));
});

it("a broken remote never fails the build", async () => {
  const clock = new ManualClock();
  const remote = new FakeRemote(clock, 5, true);
  const m = machine(clock, remote);
  const s = await m.run();
  expect(s.ok).toBe(true);
  expect(s.tasks.map((t: any) => [t.status, t.cacheSource])).toEqual(Array(5).fill(["executed", null]));
  expect(m.local.size).toBe(5);
  expect(m.bus.of("warn").length).toBeGreaterThan(0);
  expect(m.bus.of("warn").every((w) => typeof w.id === "string")).toBe(true);
});

it("uploads don't block dependents, but the run waits for them", async () => {
  const clock = new ManualClock();
  const remote = new FakeRemote(clock, 0, false, 1000);
  const m = machine(clock, remote);
  await m.run();
  const starts = Object.fromEntries(m.bus.of("task:start").map((e) => [e.id, e.at]));
  expect(starts["@acme/utils#build"]).toBe(0);
  expect(starts["@acme/ui#build"]).toBe(10);
  expect(remote.entries.size).toBe(5);
});

it("respects remoteCache read/write config and reports cacheSource in the CLI", async () => {
  expect(loadConfig(sampleRepo()).remoteCache).toEqual({ read: true, write: true });
  const clock = new ManualClock();
  const remote = new FakeRemote(clock);
  await machine(clock, remote).run();
  const fs = sampleRepo({
    "buildgraph.json": JSON.stringify({
      pipeline: { build: { dependsOn: ["^build"], outputs: ["dist/**"] } },
      remoteCache: { read: true, write: false },
    }),
  });
  const cli = createCli({ fs, clock, env: {}, cache: new MemoryCacheStore(), remoteCache: remote } as any);
  const r = await clock.run(cli.run(["build"]));
  expect(r.exitCode).toBe(0);
  // different buildgraph.json => different global hash => remote misses, and nothing is uploaded
  expect((r.output.tasks as any[]).map((t) => t.cacheSource)).toEqual(Array(5).fill(null));
  expect(remote.puts).toBe(5);
  const r2 = await clock.run(cli.run(["build"]));
  expect((r2.output.tasks as any[]).map((t) => t.cacheSource)).toEqual(Array(5).fill("local"));
  expect(r2.text).toContain("remote");

  const noRead = sampleRepo({ "buildgraph.json": JSON.stringify({ remoteCache: { read: false } }) });
  const gets = remote.gets;
  const r3 = await clock.run(createCli({ fs: noRead, clock, env: {}, cache: new MemoryCacheStore(), remoteCache: remote } as any).run(["build"]));
  expect(r3.exitCode).toBe(0);
  expect(remote.gets).toBe(gets);
});
