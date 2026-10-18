import { it, expect } from "testkit";
import { graphFromEdges } from "../helpers/graph";
import { Graph } from "../../src/graph/dag";
import { CycleError } from "../../src/core/errors";

it("graphFromEdges builds graphs from a compact spec", () => {
  const g = graphFromEdges(" app -> lib -> core,\n  app->core ,, tools\n");
  expect(g).toBeInstanceOf(Graph);
  expect(g.nodes()).toEqual(["app", "core", "lib", "tools"]);
  expect(g.edges()).toEqual([
    ["app", "core"],
    ["app", "lib"],
    ["lib", "core"],
  ]);
  expect(() => graphFromEdges("a ->")).toThrow(Error);
  expect(() => graphFromEdges("-> b")).toThrow(Error);
  expect(() => graphFromEdges("a -> -> b")).toThrow(Error);
});

it("reports only the nodes on the cycle", () => {
  const g = graphFromEdges("x -> a, a -> b, b -> c, c -> b");
  expect(g.findCycle()).toEqual(["b", "c", "b"]);
  let err: unknown;
  try {
    g.topoSort();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(CycleError);
  expect((err as CycleError).message).toBe("Cycle detected: b → c → b");
  expect(graphFromEdges("a -> a, z -> a").findCycle()).toEqual(["a", "a"]);
});
