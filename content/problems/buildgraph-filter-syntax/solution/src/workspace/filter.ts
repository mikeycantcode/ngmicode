import { BuildGraphError } from "../core/errors";
import type { Graph } from "../graph/dag";
import { matchGlob } from "../utils/glob";
import { byString } from "../utils/collections";
import type { Workspace } from "./workspace";

export interface Selector {
  raw: string;
  exclude: boolean;
  /** `pkg...` — include transitive dependencies */
  deps: boolean;
  /** `...pkg` — include transitive dependents */
  dependents: boolean;
  kind: "name" | "dir";
  pattern: string;
}

export function parseSelector(raw: string): Selector {
  let s = raw.trim();
  const exclude = s.startsWith("!");
  if (exclude) s = s.slice(1);
  const dependents = s.startsWith("...");
  if (dependents) s = s.slice(3);
  const deps = s.endsWith("...");
  if (deps) s = s.slice(0, -3);
  const kind = s.startsWith("./") ? "dir" : "name";
  const pattern = kind === "dir" ? s.slice(2).replace(/\/$/, "") : s;
  if (!pattern) throw new BuildGraphError("E_FILTER", `Invalid filter "${raw}"`);
  return { raw, exclude, deps, dependents, kind, pattern };
}

function evaluate(ws: Workspace, g: Graph, sel: Selector): Set<string> {
  const base = [...ws.packages.values()]
    .filter((p) => matchGlob(sel.pattern, sel.kind === "dir" ? p.dir : p.name))
    .map((p) => p.name);
  const out = new Set(base);
  for (const n of base) {
    if (sel.deps) for (const d of g.transitiveDependencies(n)) out.add(d);
    if (sel.dependents) for (const d of g.transitiveDependents(n)) out.add(d);
  }
  return out;
}

/** Applies filter selectors; returns selected package names sorted. */
export function selectPackages(ws: Workspace, g: Graph, selectors: string[]): string[] {
  const parsed = selectors.map(parseSelector);
  const includes = parsed.filter((s) => !s.exclude);
  const selected = new Set<string>(includes.length ? [] : ws.packages.keys());
  for (const sel of includes) {
    const hit = evaluate(ws, g, sel);
    if (hit.size === 0) throw new BuildGraphError("E_FILTER", `No packages matched filter "${sel.raw}"`);
    for (const n of hit) selected.add(n);
  }
  for (const sel of parsed.filter((s) => s.exclude)) for (const n of evaluate(ws, g, sel)) selected.delete(n);
  return [...selected].sort(byString);
}
