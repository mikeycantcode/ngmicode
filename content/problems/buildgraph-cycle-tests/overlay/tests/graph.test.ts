import { describe, it, expect } from "testkit";
import { Graph } from "../src/graph/dag";
import { buildTaskGraph } from "../src/graph/task-graph";
import { loadWorkspace } from "../src/workspace/workspace";
import { buildPackageGraph } from "../src/workspace/package-graph";
import { loadConfig } from "../src/config/config";
import { CycleError } from "../src/core/errors";
import { sampleRepo } from "./fixtures";

describe("Graph", () => {
  it("topologically sorts with deterministic tie-breaks", () => {
    const g = new Graph().addEdge("app", "lib").addEdge("app", "core").addEdge("lib", "core").addNode("zeta").addNode("alpha");
    expect(g.topoSort()).toEqual(["alpha", "core", "lib", "app", "zeta"]);
    expect(g.layers()).toEqual([["alpha", "core", "zeta"], ["lib"], ["app"]]);
  });
  it("reports the cycle path", () => {
    const g = new Graph().addEdge("a", "b").addEdge("b", "c").addEdge("c", "a");
    expect(g.findCycle()).toEqual(["a", "b", "c", "a"]);
    expect(() => g.topoSort()).toThrow("Cycle detected: a → b → c → a");
  });
  it("computes transitive closures", () => {
    const g = new Graph().addEdge("a", "b").addEdge("b", "c").addEdge("d", "c");
    expect(g.transitiveDependencies("a")).toEqual(["b", "c"]);
    expect(g.transitiveDependents("c")).toEqual(["a", "b", "d"]);
  });
});

describe("task graph", () => {
  const setup = (fs = sampleRepo()) => {
    const ws = loadWorkspace(fs);
    return { ws, pg: buildPackageGraph(ws), cfg: loadConfig(fs) };
  };

  it("expands ^build across workspace deps", () => {
    const { ws, pg, cfg } = setup();
    const tg = buildTaskGraph(ws, pg, cfg, { tasks: ["build"], packages: ["@acme/web"] });
    expect(tg.graph.nodes()).toEqual(["@acme/ui#build", "@acme/utils#build", "@acme/web#build"]);
    expect(tg.graph.successors("@acme/web#build")).toEqual(["@acme/ui#build", "@acme/utils#build"]);
  });
  it("links same-package dependencies", () => {
    const { ws, pg, cfg } = setup();
    const tg = buildTaskGraph(ws, pg, cfg, { tasks: ["test"] });
    expect(tg.graph.successors("@acme/ui#test")).toEqual(["@acme/ui#build"]);
    expect(tg.graph.hasNode("@acme/docs#test")).toBe(false); // docs has no test script
  });
  it("throws a CycleError on cyclic workspaces", () => {
    const fs = sampleRepo({
      "packages/utils/package.json": JSON.stringify({ name: "@acme/utils", version: "1.4.0", dependencies: { "@acme/web": "workspace:*" }, scripts: { build: "noop" } }),
    });
    const { ws, pg, cfg } = setup(fs);
    expect(() => buildTaskGraph(ws, pg, cfg, { tasks: ["build"] })).toThrow(CycleError);
  });
  it("rejects unknown tasks", () => {
    const { ws, pg, cfg } = setup();
    expect(() => buildTaskGraph(ws, pg, cfg, { tasks: ["deploy"] })).toThrow('Unknown task "deploy"');
  });
});
