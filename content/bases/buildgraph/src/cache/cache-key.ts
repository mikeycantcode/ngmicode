import type { BuildGraphConfig } from "../config/types";
import type { TaskNode } from "../graph/task-graph";
import type { VirtualFS } from "../vfs/vfs";
import { matchAny, matchGlob } from "../utils/glob";
import { hashObject, hashString } from "../utils/hash";
import { relative } from "../utils/paths";

/** Everything that went into a task hash. Kept so `--summarize` can explain cache misses. */
export interface HashManifest {
  task: string;
  script: string;
  files: Record<string, string>;
  env: Record<string, string>;
  dependencies: Record<string, string>;
  global: string;
  outputs: string[];
}

export interface TaskHash {
  hash: string;
  manifest: HashManifest;
}

/** Package-relative input files for a task: matches `inputs`, never matches `outputs`. */
export function collectInputFiles(fs: VirtualFS, node: TaskNode): string[] {
  const out: string[] = [];
  for (const file of fs.list(node.dir)) {
    const rel = relative(node.dir, file);
    if (node.def.outputs.some((o) => matchGlob(o, rel))) continue;
    if (!matchAny(node.def.inputs, rel)) continue;
    out.push(rel);
  }
  return out;
}

/**
 * Env values are hashed before they enter the manifest so secrets (tokens, keys)
 * never end up in cache metadata or `--summarize` output.
 */
function envFingerprint(env: Record<string, string>, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [...names].sort()) {
    const v = env[name];
    out[name] = v === undefined ? "<unset>" : hashString(v);
  }
  return out;
}

export function computeGlobalHash(fs: VirtualFS, cfg: BuildGraphConfig, env: Record<string, string>): string {
  const files: Record<string, string> = {};
  for (const f of fs.list()) {
    if (cfg.globalDependencies.some((g) => matchGlob(g, f))) files[f] = hashString(fs.read(f));
  }
  return hashObject({ files, env: envFingerprint(env, cfg.globalEnv) });
}

/**
 * Cache key for one task: its script, its own input files, the env vars it declares,
 * the hashes of every task it depends on (which transitively cover *their* inputs),
 * and the global hash.
 */
export function computeTaskHash(
  fs: VirtualFS,
  node: TaskNode,
  env: Record<string, string>,
  dependencyHashes: Record<string, string>,
  globalHash: string,
): TaskHash {
  const files: Record<string, string> = {};
  for (const rel of collectInputFiles(fs, node)) files[rel] = hashString(fs.read(`${node.dir}/${rel}`));
  const manifest: HashManifest = {
    task: node.id,
    script: node.script,
    files,
    env: envFingerprint(env, node.def.env),
    dependencies: { ...dependencyHashes },
    global: globalHash,
    outputs: [...node.def.outputs],
  };
  return { hash: hashObject(manifest), manifest };
}
