import { CycleError } from "../core/errors";
import { byString } from "../utils/collections";

/**
 * Directed graph over string ids. An edge `from -> to` means "from depends on to",
 * so in a topological order `to` comes before `from`.
 *
 * All traversal orders are deterministic (ties broken by id, ascending).
 */
export class Graph {
  private out = new Map<string, Set<string>>();
  private inc = new Map<string, Set<string>>();

  addNode(id: string): this {
    if (!this.out.has(id)) {
      this.out.set(id, new Set());
      this.inc.set(id, new Set());
    }
    return this;
  }

  addEdge(from: string, to: string): this {
    this.addNode(from).addNode(to);
    this.out.get(from)!.add(to);
    this.inc.get(to)!.add(from);
    return this;
  }

  hasNode(id: string): boolean {
    return this.out.has(id);
  }

  hasEdge(from: string, to: string): boolean {
    return !!this.out.get(from)?.has(to);
  }

  nodes(): string[] {
    return [...this.out.keys()].sort(byString);
  }

  edges(): [string, string][] {
    const out: [string, string][] = [];
    for (const from of this.nodes()) for (const to of this.successors(from)) out.push([from, to]);
    return out;
  }

  get size(): number {
    return this.out.size;
  }

  /** Direct dependencies of `id`. */
  successors(id: string): string[] {
    return [...(this.out.get(id) ?? [])].sort(byString);
  }

  /** Direct dependents of `id`. */
  predecessors(id: string): string[] {
    return [...(this.inc.get(id) ?? [])].sort(byString);
  }

  /** All transitive dependencies of `id` (excluding `id`), sorted. */
  transitiveDependencies(id: string): string[] {
    return this.reach(id, this.out);
  }

  /** All transitive dependents of `id` (excluding `id`), sorted. */
  transitiveDependents(id: string): string[] {
    return this.reach(id, this.inc);
  }

  private reach(start: string, adj: Map<string, Set<string>>): string[] {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const n = stack.pop()!;
      for (const m of adj.get(n) ?? []) {
        if (!seen.has(m) && m !== start) {
          seen.add(m);
          stack.push(m);
        }
      }
    }
    return [...seen].sort(byString);
  }

  /** Subgraph induced by `ids`. */
  subgraph(ids: Iterable<string>): Graph {
    const keep = new Set(ids);
    const g = new Graph();
    for (const id of keep) if (this.hasNode(id)) g.addNode(id);
    for (const id of keep) for (const to of this.out.get(id) ?? []) if (keep.has(to)) g.addEdge(id, to);
    return g;
  }

  /**
   * Returns one cycle as a closed path (first element repeated at the end), e.g.
   * ["b", "c", "b"], or null if the graph is acyclic. Only nodes ON the cycle are
   * included, never the path that led into it.
   */
  findCycle(): string[] | null {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    const stack: string[] = [];

    const visit = (n: string): string[] | null => {
      color.set(n, GRAY);
      stack.push(n);
      for (const m of this.successors(n)) {
        const c = color.get(m) ?? WHITE;
        if (c === GRAY) return [...stack, m]; // the DFS stack is the path that closed the loop
        if (c === WHITE) {
          const found = visit(m);
          if (found) return found;
        }
      }
      stack.pop();
      color.set(n, BLACK);
      return null;
    };

    for (const n of this.nodes()) {
      if ((color.get(n) ?? WHITE) === WHITE) {
        const found = visit(n);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Dependencies-first order (Kahn's algorithm). Among nodes that are ready at the
   * same time, the smallest id goes first. Throws CycleError if the graph is cyclic.
   */
  topoSort(): string[] {
    const remaining = new Map<string, number>();
    for (const [id, deps] of this.out) remaining.set(id, deps.size);
    const ready = [...remaining].filter(([, n]) => n === 0).map(([id]) => id).sort(byString);
    const order: string[] = [];
    while (ready.length) {
      const n = ready.shift()!;
      order.push(n);
      for (const dependent of this.inc.get(n)!) {
        const left = remaining.get(dependent)! - 1;
        remaining.set(dependent, left);
        if (left === 0) insertSorted(ready, dependent);
      }
    }
    if (order.length !== this.out.size) {
      throw new CycleError(this.findCycle() ?? ["<unknown>"]);
    }
    return order;
  }

  /** Groups nodes into levels: level 0 has no deps, level k depends only on < k. */
  layers(): string[][] {
    const level = new Map<string, number>();
    for (const n of this.topoSort()) {
      let l = 0;
      for (const d of this.out.get(n)!) l = Math.max(l, level.get(d)! + 1);
      level.set(n, l);
    }
    const out: string[][] = [];
    for (const [n, l] of level) (out[l] ??= []).push(n);
    return out.map((xs) => xs.sort(byString));
  }
}

function insertSorted(arr: string[], x: string) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, x);
}
