import { ResolveError } from "../core/errors";
import { maxSatisfying, satisfies } from "../semver/range";
import { externalDependencies } from "../workspace/package-graph";
import type { Workspace } from "../workspace/workspace";
import { byString } from "../utils/collections";
import { emptyLockfile, lockKey, type Lockfile } from "./lockfile";
import type { Registry } from "./registry";

export interface ResolveOptions {
  /** Previous lockfile; entries that still satisfy their spec are kept as-is. */
  lockfile?: Lockfile;
  /** Fail instead of resolving anything that isn't already locked (CI mode). */
  frozen?: boolean;
}

export interface ResolveResult {
  lockfile: Lockfile;
  /** Lock keys that were newly resolved (not reused from the previous lockfile). */
  resolved: string[];
  reused: string[];
}

/**
 * Resolves every external dependency spec in the workspace (and their transitive
 * dependencies) to the highest registry version satisfying it. Prereleases are only
 * picked when the spec itself opts in (see Range prerelease rule).
 */
export function resolveDependencies(ws: Workspace, registry: Registry, opts: ResolveOptions = {}): ResolveResult {
  const lock = emptyLockfile();
  const resolved: string[] = [];
  const reused: string[] = [];
  const queue: [string, string][] = [];

  const ext = externalDependencies(ws);
  for (const name of [...ext.keys()].sort(byString)) {
    for (const spec of [...ext.get(name)!].sort(byString)) queue.push([name, spec]);
  }

  while (queue.length) {
    const [name, spec] = queue.shift()!;
    const key = lockKey(name, spec);
    if (lock.packages[key]) continue;

    const published = registry.versions(name);
    if (!published) throw new ResolveError(`Package "${name}" not found in registry`);

    const prev = opts.lockfile?.packages[key];
    const prevMeta = prev && published.find((p) => p.version === prev.version);
    let meta;
    if (prev && prevMeta && satisfies(prev.version, spec)) {
      meta = prevMeta;
      reused.push(key);
    } else {
      if (opts.frozen) throw new ResolveError(`Lockfile is out of date: ${key} needs to be resolved (frozen mode)`);
      const best = maxSatisfying(
        published.map((p) => p.version),
        spec,
      );
      if (!best) {
        throw new ResolveError(
          `No version of "${name}" satisfies "${spec}" (available: ${published.map((p) => p.version).join(", ")})`,
        );
      }
      meta = published.find((p) => p.version === best)!;
      resolved.push(key);
    }

    lock.packages[key] = { version: meta.version, integrity: meta.integrity, dependencies: { ...meta.dependencies } };
    for (const [dep, depSpec] of Object.entries(meta.dependencies).sort(([a], [b]) => byString(a, b))) {
      queue.push([dep, depSpec]);
    }
  }

  return { lockfile: lock, resolved, reused };
}
