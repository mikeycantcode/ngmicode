import { ConfigError, CycleError } from "../core/errors";
import { resolveTaskDefinition } from "../config/config";
import type { BuildGraphConfig, TaskDefinition } from "../config/types";
import type { Workspace, WorkspacePackage } from "../workspace/workspace";
import { Graph } from "./dag";

export interface TaskNode {
  id: string;
  pkg: string;
  task: string;
  dir: string;
  script: string;
  def: TaskDefinition;
}

export interface TaskGraph {
  graph: Graph;
  nodes: Map<string, TaskNode>;
}

export function taskId(pkg: string, task: string): string {
  return `${pkg}#${task}`;
}

export function parseTaskId(id: string): { pkg: string; task: string } {
  const i = id.lastIndexOf("#");
  if (i <= 0) throw new ConfigError(`Invalid task id "${id}" (expected <package>#<task>)`);
  return { pkg: id.slice(0, i), task: id.slice(i + 1) };
}

export interface TaskGraphRequest {
  tasks: string[];
  /** Restrict entry points to these packages. Dependencies outside the set are still pulled in. */
  packages?: string[];
}

/**
 * Expands requested tasks into the full task graph via each task's `dependsOn`.
 * A package that has no script for a `^task` dependency is transparent: we continue
 * into its own dependencies so ordering across it is preserved.
 */
export function buildTaskGraph(ws: Workspace, pkgGraph: Graph, cfg: BuildGraphConfig, req: TaskGraphRequest): TaskGraph {
  for (const t of req.tasks) {
    if (!cfg.pipeline[t]) {
      throw new ConfigError(`Unknown task "${t}". Pipeline defines: ${Object.keys(cfg.pipeline).sort().join(", ") || "(none)"}`);
    }
  }
  const graph = new Graph();
  const nodes = new Map<string, TaskNode>();
  const queue: TaskNode[] = [];

  const ensure = (pkg: WorkspacePackage, task: string): TaskNode | undefined => {
    const id = taskId(pkg.name, task);
    const existing = nodes.get(id);
    if (existing) return existing;
    const script = pkg.manifest.scripts[task];
    const def = resolveTaskDefinition(cfg, pkg, task);
    if (script === undefined || !def) return undefined;
    const node: TaskNode = { id, pkg: pkg.name, task, dir: pkg.dir, script, def };
    nodes.set(id, node);
    graph.addNode(id);
    queue.push(node);
    return node;
  };

  const entry = req.packages ?? [...ws.packages.keys()];
  for (const name of entry) {
    const pkg = ws.packages.get(name);
    if (!pkg) throw new ConfigError(`Unknown package "${name}"`);
    for (const t of req.tasks) ensure(pkg, t);
  }

  while (queue.length) {
    const node = queue.shift()!;
    for (const dep of node.def.dependsOn) {
      if (dep.startsWith("^")) {
        const task = dep.slice(1);
        const seen = new Set<string>();
        const walk = (pkgName: string) => {
          for (const d of pkgGraph.successors(pkgName)) {
            if (seen.has(d)) continue;
            seen.add(d);
            const target = ensure(ws.packages.get(d)!, task);
            if (target) graph.addEdge(node.id, target.id);
            else walk(d);
          }
        };
        walk(node.pkg);
      } else if (dep.includes("#")) {
        const { pkg, task } = parseTaskId(dep);
        const p = ws.packages.get(pkg);
        if (!p) throw new ConfigError(`${node.id} depends on unknown package task "${dep}"`);
        const target = ensure(p, task);
        if (target) graph.addEdge(node.id, target.id);
      } else {
        const target = ensure(ws.packages.get(node.pkg)!, dep);
        if (target) graph.addEdge(node.id, target.id);
      }
    }
  }

  const cycle = graph.findCycle();
  if (cycle) throw new CycleError(cycle);
  return { graph, nodes };
}
