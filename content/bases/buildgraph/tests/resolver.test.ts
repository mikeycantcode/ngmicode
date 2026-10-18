import { describe, it, expect } from "testkit";
import { resolveDependencies } from "../src/resolver/resolver";
import { parseLockfile, parseLockKey, serializeLockfile } from "../src/resolver/lockfile";
import { loadWorkspace } from "../src/workspace/workspace";
import { sampleRegistry, sampleRepo } from "./fixtures";

describe("resolver", () => {
  it("resolves the highest satisfying non-prerelease versions, transitively", () => {
    const r = resolveDependencies(loadWorkspace(sampleRepo()), sampleRegistry());
    const pkgs = r.lockfile.packages;
    expect(Object.keys(pkgs).sort()).toEqual([
      "js-tokens@^3.0.0 || ^4.0.0",
      "lodash@^4.17.0",
      "lodash@~4.17.20",
      "loose-envify@^1.1.0",
      "react@^18.0.0",
      "react@^18.2.0",
    ]);
    expect(pkgs["lodash@^4.17.0"].version).toBe("4.17.21");
    expect(pkgs["react@^18.0.0"].version).toBe("18.3.1");
    expect(pkgs["js-tokens@^3.0.0 || ^4.0.0"].version).toBe("4.0.0");
  });
  it("reuses locked versions that still satisfy", () => {
    const ws = loadWorkspace(sampleRepo());
    const first = resolveDependencies(ws, sampleRegistry()).lockfile;
    first.packages["lodash@^4.17.0"] = { ...first.packages["lodash@^4.17.0"], version: "4.17.19" };
    const again = resolveDependencies(ws, sampleRegistry(), { lockfile: first });
    expect(again.lockfile.packages["lodash@^4.17.0"].version).toBe("4.17.19");
    expect(again.resolved).toEqual([]);
  });
  it("fails in frozen mode when the lockfile is stale", () => {
    const ws = loadWorkspace(sampleRepo());
    expect(() => resolveDependencies(ws, sampleRegistry(), { frozen: true })).toThrow("frozen");
  });
  it("round-trips the lockfile deterministically", () => {
    const lock = resolveDependencies(loadWorkspace(sampleRepo()), sampleRegistry()).lockfile;
    const text = serializeLockfile(lock);
    expect(serializeLockfile(parseLockfile(text))).toBe(text);
    expect(parseLockKey("@scope/x@^1.0.0")).toEqual({ name: "@scope/x", spec: "^1.0.0" });
  });
});
