import { describe, it, expect } from "testkit";
import { parseManifest } from "../src/workspace/manifest";
import { loadWorkspace } from "../src/workspace/workspace";
import { buildPackageGraph, externalDependencies } from "../src/workspace/package-graph";
import { loadConfig, resolveTaskDefinition } from "../src/config/config";
import { ManifestError, ConfigError } from "../src/core/errors";
import { sampleRepo } from "./fixtures";

describe("manifest", () => {
  it("parses and validates", () => {
    const m = parseManifest(JSON.stringify({ name: "@a/b", version: "v1.0.0", dependencies: { x: "^1" } }), "p.json");
    expect(m.version).toBe("1.0.0");
    expect(m.dependencies).toEqual({ x: "^1" });
    expect(() => parseManifest("{", "p.json")).toThrow(ManifestError);
    expect(() => parseManifest(JSON.stringify({ name: "Bad Name" }), "p.json")).toThrow("invalid package name");
    expect(() => parseManifest(JSON.stringify({ name: "a", dependencies: { x: "^^1" } }), "p.json")).toThrow('invalid range "^^1"');
  });
});

describe("workspace", () => {
  it("discovers packages sorted by name", () => {
    const ws = loadWorkspace(sampleRepo());
    expect([...ws.packages.keys()]).toEqual(["@acme/docs", "@acme/ui", "@acme/ui-kit", "@acme/utils", "@acme/web"]);
    expect(ws.packages.get("@acme/ui-kit")!.dir).toBe("packages/ui-kit");
  });
  it("rejects duplicate names", () => {
    const fs = sampleRepo({ "packages/dupe/package.json": JSON.stringify({ name: "@acme/ui" }) });
    expect(() => loadWorkspace(fs)).toThrow("duplicate package name");
  });
  it("builds the internal dependency graph", () => {
    const ws = loadWorkspace(sampleRepo());
    const g = buildPackageGraph(ws);
    expect(g.successors("@acme/web")).toEqual(["@acme/ui", "@acme/utils"]);
    expect(g.transitiveDependents("@acme/utils")).toEqual(["@acme/docs", "@acme/ui", "@acme/ui-kit", "@acme/web"]);
    expect(g.topoSort()).toEqual(["@acme/utils", "@acme/ui", "@acme/ui-kit", "@acme/docs", "@acme/web"]);
    const ext = externalDependencies(ws);
    expect([...ext.get("lodash")!].sort()).toEqual(["^4.17.0", "~4.17.20"]);
    expect(ext.has("@acme/ui")).toBe(false);
  });
});

describe("config", () => {
  it("merges defaults, file and overrides", () => {
    const cfg = loadConfig(sampleRepo(), { concurrency: 1 });
    expect(cfg.concurrency).toBe(1);
    expect(cfg.pipeline.build.outputs).toEqual(["dist/**"]);
    expect(cfg.pipeline.lint).toEqual({ dependsOn: [], inputs: ["**"], outputs: [], env: [], cache: true });
    expect(cfg.globalDependencies).toEqual(["buildgraph.json", "package.json"]);
  });
  it("applies per-package task overrides", () => {
    const fs = sampleRepo();
    const cfg = loadConfig(fs);
    const ws = loadWorkspace(fs);
    expect(resolveTaskDefinition(cfg, ws.packages.get("@acme/web")!, "build")!.env).toEqual(["API_URL"]);
    expect(resolveTaskDefinition(cfg, ws.packages.get("@acme/ui")!, "build")!.env).toEqual([]);
  });
  it("rejects typos", () => {
    expect(() => loadConfig(sampleRepo({ "buildgraph.json": JSON.stringify({ pipeline: { build: { output: [] } } }) }))).toThrow(ConfigError);
    expect(() => loadConfig(sampleRepo(), { concurrency: 0 })).toThrow("positive integer");
  });
});
