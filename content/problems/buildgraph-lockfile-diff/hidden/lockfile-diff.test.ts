import { it, expect } from "testkit";
import { diffLockfiles } from "../../src/resolver/lockfile-diff";
import type { Lockfile } from "../../src/resolver/lockfile";
import { createCli } from "../../src/cli/commands";
import { MemoryCacheStore } from "../../src/cache/cache-store";
import { ManualClock } from "../../src/scheduler/clock";
import { sampleRegistry, sampleRepo } from "../fixtures";

const e = (version: string, integrity = `i-${version}`) => ({ version, integrity, dependencies: {} });
const lock = (packages: Lockfile["packages"]): Lockfile => ({ lockfileVersion: 1, packages });

it("diffs by package name and resolved version set", () => {
  const prev = lock({
    "react@^17.0.0": e("17.0.2"),
    "react@^18.0.0": e("18.2.0"),
    "@acme/icons@^1.0.0": e("1.0.0"),
    "lodash@^4.17.0": e("4.17.21"),
    "left-pad@^1.0.0": e("1.3.0"),
    "multi@^1.0.0": e("1.0.0"),
    "multi@^2.0.0": e("2.0.0"),
  });
  const next = lock({
    "react@^17.0.0": e("17.0.2"),
    "react@^18.0.0": e("18.3.1"),
    "@acme/icons@^1.0.0": e("1.2.0"),
    "lodash@^4.17.0": e("4.17.21"),
    "lodash@~4.17.20": e("4.17.21"),
    "multi@^3.0.0": e("3.0.0"),
    "zod@^3.0.0": e("3.22.4"),
  });
  const snapshot = JSON.stringify(prev);
  expect(diffLockfiles(prev, next)).toEqual({
    added: [
      { name: "multi", version: "3.0.0" },
      { name: "zod", version: "3.22.4" },
    ],
    removed: [
      { name: "left-pad", version: "1.3.0" },
      { name: "multi", version: "1.0.0" },
      { name: "multi", version: "2.0.0" },
    ],
    changed: [
      { name: "@acme/icons", from: "1.0.0", to: "1.2.0" },
      { name: "react", from: "18.2.0", to: "18.3.1" },
    ],
    integrityChanged: [],
  });
  expect(JSON.stringify(prev)).toBe(snapshot);
});

it("sorts versions by semver precedence and reports integrity drift", () => {
  const prev = lock({ "a@^1": e("1.0.0"), "b@^4": e("4.17.21", "old") });
  const next = lock({
    "a@^1": e("1.0.0"),
    "a@1.10.x": e("1.10.0"),
    "a@1.9.x": e("1.9.0"),
    "a@1.2.x": e("1.2.0"),
    "b@^4": e("4.17.21", "new"),
  });
  const d = diffLockfiles(prev, next);
  expect(d.added).toEqual([
    { name: "a", version: "1.2.0" },
    { name: "a", version: "1.9.0" },
    { name: "a", version: "1.10.0" },
  ]);
  expect(d.integrityChanged).toEqual([{ name: "b", version: "4.17.21" }]);
  expect(diffLockfiles(null, lock({ "x@^1": e("1.0.0") })).added).toEqual([{ name: "x", version: "1.0.0" }]);
});

it("install reports the diff", async () => {
  const fs = sampleRepo();
  const clock = new ManualClock();
  const cli = createCli({ fs, clock, env: {}, cache: new MemoryCacheStore(), registry: sampleRegistry() });
  const first = await clock.run(cli.run(["install"]));
  expect((first.output.diff as any).added).toContainEqual({ name: "react", version: "18.3.1" });
  fs.write(
    "apps/web/package.json",
    fs.read("apps/web/package.json").replace('"react": "^18.0.0"', '"react": "^18.3.0"'),
  );
  const second = await clock.run(cli.run(["install"]));
  // a new spec resolving to an already-locked version is not a change
  expect(second.output.diff).toEqual({ added: [], removed: [], changed: [], integrityChanged: [] });
  expect(second.output.changed).toBe(true);
});
