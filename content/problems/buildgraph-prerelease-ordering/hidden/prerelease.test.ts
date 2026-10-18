import { it, expect } from "testkit";
import { compare, sortVersions } from "../../src/semver/compare";
import { maxSatisfying } from "../../src/semver/range";
import { parse, format } from "../../src/semver/parse";
import { resolveDependencies } from "../../src/resolver/resolver";
import { InMemoryRegistry } from "../../src/resolver/registry";
import { loadWorkspace } from "../../src/workspace/workspace";
import { MemoryFS } from "../../src/vfs/vfs";

it("orders prereleases per SemVer §11", () => {
  expect(sortVersions(["1.0.0-beta.11", "1.0.0", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-alpha", "1.0.0-alpha.beta", "1.0.0-rc.1"])).toEqual([
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ]);
  expect(compare("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
  expect(compare("1.0.0-2", "1.0.0-10")).toBe(-1);
  expect(parse("1.0.0-beta.11")!.prerelease).toEqual(["beta", 11]);
  expect(format(parse("1.0.0-beta.11.x-y")!)).toBe("1.0.0-beta.11.x-y");
});

it("maxSatisfying picks the newest prerelease", () => {
  expect(maxSatisfying(["3.0.0-beta.2", "3.0.0-beta.11", "3.0.0-beta.9"], "^3.0.0-beta.1")).toBe("3.0.0-beta.11");
  expect(maxSatisfying(["1.0.0-alpha", "1.0.0-alpha.1"], "^1.0.0-alpha")).toBe("1.0.0-alpha.1");
});

it("resolver locks the newest matching beta", () => {
  const fs = new MemoryFS({
    "package.json": JSON.stringify({ name: "r", private: true, workspaces: ["apps/*"] }),
    "apps/site/package.json": JSON.stringify({ name: "site", version: "1.0.0", dependencies: { "@acme/design-tokens": "^3.0.0-beta.1" } }),
  });
  const registry = new InMemoryRegistry({
    "@acme/design-tokens": { "3.0.0-beta.1": {}, "3.0.0-beta.2": {}, "3.0.0-beta.11": {}, "2.9.0": {} },
  });
  const r = resolveDependencies(loadWorkspace(fs), registry);
  expect(r.lockfile.packages["@acme/design-tokens@^3.0.0-beta.1"].version).toBe("3.0.0-beta.11");
});
