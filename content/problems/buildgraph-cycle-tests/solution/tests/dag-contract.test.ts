import { describe, it, expect } from "testkit";
import { graphFromEdges } from "./helpers/graph";
import { CycleError } from "../src/core/errors";

describe("graphFromEdges", () => {
  it("parses chains, bare nodes and separators", () => {
    const g = graphFromEdges("a -> b -> c\n d, ,e->c");
    expect(g.nodes()).toEqual(["a", "b", "c", "d", "e"]);
    expect(g.edges()).toEqual([["a", "b"], ["b", "c"], ["e", "c"]]);
  });
  it("rejects malformed items", () => {
    for (const bad of ["a ->", "-> b", "a -> -> b", "a b -> c"]) expect(() => graphFromEdges(bad)).toThrow(Error);
  });
});

describe("Graph contract", () => {
  it("topoSort puts dependencies first, ties by id", () => {
    expect(graphFromEdges("b -> a, c -> a, z, d").topoSort()).toEqual(["a", "b", "c", "d", "z"]);
  });
  it("findCycle excludes the tail leading into the cycle", () => {
    expect(graphFromEdges("x -> a, a -> b, b -> c, c -> b").findCycle()).toEqual(["b", "c", "b"]);
    expect(graphFromEdges("a -> a").findCycle()).toEqual(["a", "a"]);
    expect(graphFromEdges("a -> b").findCycle()).toBeNull();
  });
  it("topoSort throws CycleError with the cycle path", () => {
    expect(() => graphFromEdges("x -> a, a -> b, b -> a").topoSort()).toThrow(CycleError);
    expect(() => graphFromEdges("x -> a, a -> b, b -> a").topoSort()).toThrow("Cycle detected: a → b → a");
  });
  it("transitive closures and layers", () => {
    const g = graphFromEdges("a -> b -> c, d -> c, e");
    expect(g.transitiveDependencies("a")).toEqual(["b", "c"]);
    expect(g.transitiveDependents("c")).toEqual(["a", "b", "d"]);
    expect(g.layers()).toEqual([["c", "e"], ["b", "d"], ["a"]]);
  });
  it("subgraph keeps only internal edges", () => {
    const s = graphFromEdges("a -> b -> c").subgraph(["a", "b"]);
    expect(s.edges()).toEqual([["a", "b"]]);
  });
});
