import { Graph } from "../../src/graph/dag";

/**
 * Builds a Graph from "a -> b -> c, d" style specs. Items are separated by commas
 * and/or newlines; `a -> b` means a depends on b; bare names add isolated nodes.
 */
export function graphFromEdges(spec: string): Graph {
  const g = new Graph();
  for (const raw of spec.split(/[,\n]/)) {
    const item = raw.trim();
    if (!item) continue;
    const parts = item.split("->").map((p) => p.trim());
    if (parts.some((p) => p === "" || /\s/.test(p))) throw new Error(`graphFromEdges: malformed item "${item}"`);
    if (parts.length === 1) g.addNode(parts[0]);
    for (let i = 0; i + 1 < parts.length; i++) g.addEdge(parts[i], parts[i + 1]);
  }
  return g;
}
