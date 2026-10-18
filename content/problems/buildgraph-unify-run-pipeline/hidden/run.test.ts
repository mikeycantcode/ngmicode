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

it("test honors --concurrency and --force like build", async () => {
  const run = cli();
  const serial = await run(["test", "--concurrency=1"]);
  // utils build 10 + test 20, ui build 35 + test 40, web build 55 + test 25 => strictly serial
  expect(serial.output.durationMs).toBe(185);
  const again = await run(["test", "--force"]);
  expect((again.output.stats as any).executed).toBe(6);
  expect((again.output.stats as any).cached).toBe(0);
});

it("run executes several tasks in one graph", async () => {
  const run = cli();
  const r = await run(["run", "lint", "test", "--filter=@acme/ui", "--concurrency=1"]);
  expect(r.exitCode).toBe(0);
  expect(r.output.command).toBe("run");
  expect(ids(r)).toEqual(["@acme/ui#build", "@acme/ui#lint", "@acme/ui#test", "@acme/utils#build"]);
  expect(r.output.durationMs).toBe(85);
  const b = await run(["build", "--filter=@acme/ui"]);
  expect(b.output.command).toBe("build");
  expect((b.output.stats as any).cached).toBe(2);
});

it("run validates its arguments", async () => {
  const run = cli();
  const none = await run(["run"]);
  expect(none.exitCode).toBe(2);
  expect((none.output.error as any).code).toBe("E_USAGE");
  const unknown = await run(["run", "deploy"]);
  expect(unknown.exitCode).toBe(1);
  expect((unknown.output.error as any).code).toBe("E_CONFIG");
});
