import type { Graph } from "../graph/dag";
import type { Workspace, WorkspacePackage } from "../workspace/workspace";
import { matchGlob } from "../utils/glob";
import { isWithin, normalize } from "../utils/paths";

export interface AffectedOptions {
  /** Root-relative globs; a change to any of them affects every package. */
  globalDependencies: string[];
}

export interface AffectedResult {
  /** Packages that directly own at least one changed file. */
  changedPackages: string[];
  /** changedPackages plus all their transitive dependents, sorted by name. */
  affected: string[];
  /** True when a global dependency changed (everything is affected). */
  global: boolean;
  /** Why each affected package is included. */
  reasons: Record<string, string>;
}

/**
 * The package owning `file`: the one whose directory is the longest prefix of the
 * path. Nested packages win over their parents, and "packages/ui-kit/x" is never
 * owned by "packages/ui".
 */
export function ownerOf(ws: Workspace, file: string): string | undefined {
  const candidates: WorkspacePackage[] = [];
  for (const p of ws.packages.values()) {
    if (isWithin(p.dir, file)) candidates.push(p);
  }
  candidates.sort((a, b) => b.dir.length - a.dir.length);
  return candidates[0]?.name;
}

function isGlobal(file: string, opts: AffectedOptions): boolean {
  return opts.globalDependencies.some((g) => matchGlob(g, normalize(file)));
}

export function findAffected(ws: Workspace, pkgGraph: Graph, changedFiles: string[], opts: AffectedOptions): AffectedResult {
  const reasons: Record<string, string> = {};
  const all = [...ws.packages.keys()].sort();

  for (const f of changedFiles) {
    if (isGlobal(f, opts)) {
      for (const n of all) reasons[n] = `global dependency changed: ${normalize(f)}`;
      const owners: string[] = [];
      for (const g of changedFiles) {
        const o = ownerOf(ws, g);
        if (o && !owners.includes(o)) owners.push(o);
      }
      return { changedPackages: owners.sort(), affected: all, global: true, reasons };
    }
  }

  const changed: string[] = [];
  for (const f of changedFiles) {
    const owner = ownerOf(ws, f);
    if (!owner) continue; // root-level file that isn't a global dependency (README, docs, ...)
    if (!changed.includes(owner)) {
      changed.push(owner);
      reasons[owner] = `changed: ${normalize(f)}`;
    }
  }

  // breadth-first over dependents so `reasons` names the closest changed dependency
  const affected: string[] = [...changed];
  const queue = [...changed].sort();
  while (queue.length) {
    const n = queue.shift()!;
    for (const candidate of all) {
      if (!pkgGraph.successors(candidate).includes(n)) continue;
      if (affected.includes(candidate)) continue;
      affected.push(candidate);
      reasons[candidate] = `depends on ${n}`;
      queue.push(candidate);
    }
  }

  return {
    changedPackages: changed.sort(),
    affected: affected.sort(),
    global: false,
    reasons,
  };
}
