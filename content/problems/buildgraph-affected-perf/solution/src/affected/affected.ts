import type { Graph } from "../graph/dag";
import type { Workspace } from "../workspace/workspace";
import { matchGlob } from "../utils/glob";
import { dirname, normalize } from "../utils/paths";
import { byString } from "../utils/collections";

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
 * Maps a file to the package that owns it: the package whose directory is the
 * longest prefix of the file path. Nested packages win over their parents, and
 * "packages/ui-kit/x" is never owned by "packages/ui".
 */
export function createOwnerLookup(ws: Workspace): (file: string) => string | undefined {
  const byDir = new Map<string, string>();
  for (const p of ws.packages.values()) byDir.set(p.dir, p.name);
  return (file) => {
    let dir = dirname(normalize(file));
    while (dir !== "" && dir !== "/" && dir !== ".") {
      const owner = byDir.get(dir);
      if (owner) return owner;
      dir = dirname(dir);
    }
    return undefined;
  };
}

export function findAffected(ws: Workspace, pkgGraph: Graph, changedFiles: string[], opts: AffectedOptions): AffectedResult {
  const reasons: Record<string, string> = {};
  const ownerOf = createOwnerLookup(ws);

  const globalHit = changedFiles.map(normalize).find((f) => opts.globalDependencies.some((g) => matchGlob(g, f)));
  if (globalHit) {
    const all = [...ws.packages.keys()].sort(byString);
    for (const n of all) reasons[n] = `global dependency changed: ${globalHit}`;
    const owners = new Set(changedFiles.map(ownerOf).filter((x): x is string => !!x));
    return { changedPackages: [...owners].sort(byString), affected: all, global: true, reasons };
  }

  const changed = new Set<string>();
  for (const f of changedFiles) {
    const owner = ownerOf(f);
    if (!owner) continue; // root-level file that isn't a global dependency (README, docs, ...)
    if (!changed.has(owner)) {
      changed.add(owner);
      reasons[owner] = `changed: ${normalize(f)}`;
    }
  }

  const affected = new Set(changed);
  const queue = [...changed].sort(byString);
  while (queue.length) {
    const n = queue.shift()!;
    for (const dependent of pkgGraph.predecessors(n)) {
      if (affected.has(dependent)) continue;
      affected.add(dependent);
      reasons[dependent] = `depends on ${n}`;
      queue.push(dependent);
    }
  }

  return {
    changedPackages: [...changed].sort(byString),
    affected: [...affected].sort(byString),
    global: false,
    reasons,
  };
}
