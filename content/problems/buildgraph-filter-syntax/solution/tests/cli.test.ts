import { describe, it, expect } from "testkit";
import { createCli } from "../src/cli/commands";
import { MemoryCacheStore } from "../src/cache/cache-store";
import { ManualClock } from "../src/scheduler/clock";
import { sampleRegistry, sampleRepo } from "./fixtures";
import { parseArgs } from "../src/cli/args";

function cli(overrides: Record<string, string> = {}) {
  const fs = sampleRepo(overrides);
  const clock = new ManualClock();
  const c = createCli({ fs, clock, env: {}, cache: new MemoryCacheStore(), registry: sampleRegistry() });
  return { fs, clock, run: (argv: string[]) => clock.run(c.run(argv)) };
}

describe("args", () => {
  it("parses flags", () => {
    expect(parseArgs(["build", "--filter", "a", "--filter=b", "--force", "--no-cache", "x"])).toEqual({
      command: "build",
      positionals: ["x"],
      flags: { filter: ["a", "b"], force: true, cache: false },
    });
  });
});

describe("cli", () => {
  it("build returns structured output", async () => {
    const { run } = cli();
    const r = await run(["build", "--filter=@acme/ui"]);
    expect(r.exitCode).toBe(0);
    expect((r.output.tasks as any[]).map((t) => t.id)).toEqual(["@acme/utils#build", "@acme/ui#build"]);
    expect(r.text).toContain("2 successful, 2 total");
  });

  it("test runs builds first and caches", async () => {
    const { run } = cli();
    await run(["test"]);
    const r = await run(["test"]);
    expect((r.output.stats as any).cached).toBe((r.output.stats as any).total);
    expect(r.text).toContain("FULL CACHE");
  });

  it("graph prints layers", async () => {
    const { run } = cli();
    const r = await run(["graph"]);
    expect(r.output.layers).toEqual([["@acme/utils"], ["@acme/ui"], ["@acme/ui-kit", "@acme/web"], ["@acme/docs"]]);
  });

  it("affected maps files to packages and dependents", async () => {
    const { run } = cli();
    const r = await run(["affected", "packages/ui/src/button.ts", "README.md"]);
    expect(r.output.changedPackages).toEqual(["@acme/ui"]);
    expect(r.output.affected).toEqual(["@acme/docs", "@acme/ui", "@acme/ui-kit", "@acme/web"]);
    const g = await run(["affected", "--files=package.json"]);
    expect(g.output.global).toBe(true);
    expect((g.output.affected as string[]).length).toBe(5);
  });

  it("install writes a lockfile", async () => {
    const { run, fs } = cli();
    const r = await run(["install"]);
    expect(r.output.changed).toBe(true);
    expect(fs.read("buildgraph.lock")).toContain('"lodash@^4.17.0"');
    const again = await run(["install", "--frozen"]);
    expect(again.output.changed).toBe(false);
  });

  it("maps errors to exit codes", async () => {
    const { run } = cli();
    expect((await run(["deploy"])).exitCode).toBe(2);
    const r = await run(["build", "--filter=@acme/nope"]);
    expect(r.exitCode).toBe(1);
    expect(r.output.error).toEqual({ code: "E_FILTER", message: 'No packages matched filter "@acme/nope"' });
  });
});
