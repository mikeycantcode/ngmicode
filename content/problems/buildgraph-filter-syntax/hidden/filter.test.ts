import { it, expect } from "testkit";
import { createCli } from "../../src/cli/commands";
import { MemoryCacheStore } from "../../src/cache/cache-store";
import { ManualClock } from "../../src/scheduler/clock";
import { sampleRepo } from "../fixtures";

function cli() {
  const fs = sampleRepo();
  const clock = new ManualClock();
  const c = createCli({ fs, clock, env: {}, cache: new MemoryCacheStore() });
  return (argv: string[]) => clock.run(c.run(argv));
}
const ids = (r: any) => (r.output.tasks as any[]).map((t) => t.id).sort();

it("expands dependents and applies exclusions after inclusions", async () => {
  const run = cli();
  const r = await run(["test", "--filter=!@acme/web", "--filter", "...@acme/utils"]);
  expect(r.exitCode).toBe(0);
  expect(ids(r)).toEqual(["@acme/ui#build", "@acme/ui#test", "@acme/utils#build", "@acme/utils#test"]);
});

it("supports name globs, directory globs and dependency expansion", async () => {
  const run = cli();
  expect(ids(await run(["test", "--filter=./apps/*"]))).toEqual(["@acme/ui#build", "@acme/utils#build", "@acme/web#build", "@acme/web#test"]);
  expect(ids(await run(["test", "--filter=@acme/ui*"]))).toEqual(["@acme/ui#build", "@acme/ui#test", "@acme/utils#build"]);
  expect(ids(await run(["test", "--filter=@acme/web...,!@acme/web"]))).toEqual(["@acme/ui#build", "@acme/ui#test", "@acme/utils#build", "@acme/utils#test"]);
});

it("applies the same filter semantics to affected", async () => {
  const run = cli();
  const a = await run(["affected", "packages/utils/src/math.ts", "--filter=./apps/*"]);
  expect(a.output.affected).toEqual(["@acme/docs", "@acme/web"]);
  expect(a.output.changedPackages).toEqual([]);
  const b = await run(["affected", "packages/ui/src/button.ts", "--filter=...@acme/ui-kit"]);
  expect(b.output.affected).toEqual(["@acme/docs", "@acme/ui-kit"]);
});

it("errors when an inclusion selector matches nothing", async () => {
  const run = cli();
  const r = await run(["build", "--filter=@acme/nope*"]);
  expect(r.exitCode).toBe(1);
  expect(r.output.error).toEqual({ code: "E_FILTER", message: 'No packages matched filter "@acme/nope*"' });
});
