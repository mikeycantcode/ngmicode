import { ResolveError } from "../core/errors";
import { Graph } from "../graph/dag";
import { satisfies } from "../semver/range";
import { allDependencies, isWorkspaceProtocol, workspaceRange } from "./manifest";
import type { Workspace } from "./workspace";

/**
 * Graph of workspace-internal dependencies. Edge a -> b means "a depends on b".
 * External (registry) dependencies are not part of this graph; see resolver/.
 */
export function buildPackageGraph(ws: Workspace): Graph {
  const g = new Graph();
  for (const name of ws.packages.keys()) g.addNode(name);
  for (const pkg of ws.packages.values()) {
    const deps = allDependencies(pkg.manifest);
    for (const [dep, spec] of Object.entries(deps)) {
      const target = ws.packages.get(dep);
      if (!target) {
        if (isWorkspaceProtocol(spec)) {
          throw new ResolveError(`${pkg.name} depends on "${dep}" via ${spec}, but no such workspace package exists`);
        }
        continue; // external dependency
      }
      const range = isWorkspaceProtocol(spec) ? workspaceRange(spec) : spec;
      if (!satisfies(target.manifest.version, range, { includePrerelease: true })) {
        // A plain range that the local version doesn't satisfy is meant for the registry.
        if (isWorkspaceProtocol(spec)) {
          throw new ResolveError(`${pkg.name} requires ${dep}@${range} but workspace has ${target.manifest.version}`);
        }
        continue;
      }
      g.addEdge(pkg.name, dep);
    }
  }
  return g;
}

/** Names of external dependencies (not provided by the workspace), with every requested spec. */
export function externalDependencies(ws: Workspace): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const pkg of ws.packages.values()) {
    for (const [dep, spec] of Object.entries(allDependencies(pkg.manifest))) {
      const local = ws.packages.get(dep);
      if (local && (isWorkspaceProtocol(spec) || satisfies(local.manifest.version, spec, { includePrerelease: true }))) continue;
      if (!out.has(dep)) out.set(dep, new Set());
      out.get(dep)!.add(spec);
    }
  }
  return out;
}
