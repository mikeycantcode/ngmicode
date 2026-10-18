import { ManifestError } from "../core/errors";
import { valid } from "../semver/parse";
import { validRange } from "../semver/range";
import { isPlainObject } from "../utils/collections";

export type DependencyKind = "dependencies" | "devDependencies" | "peerDependencies";
export const DEPENDENCY_KINDS: DependencyKind[] = ["dependencies", "devDependencies", "peerDependencies"];

export interface Manifest {
  name: string;
  version: string;
  private: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  scripts: Record<string, string>;
  /** Root manifest only: workspace globs. */
  workspaces?: string[];
  /** Per-package buildgraph overrides (merged over the root pipeline). */
  buildgraph?: Record<string, unknown>;
}

// npm package name rules (simplified): optional @scope/, lowercase, url-safe
const NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function isValidPackageName(name: string): boolean {
  return typeof name === "string" && name.length <= 214 && NAME_RE.test(name);
}

/** `workspace:*`, `workspace:^`, `workspace:~` or `workspace:<range>` */
export function isWorkspaceProtocol(spec: string): boolean {
  return spec.startsWith("workspace:");
}

export function parseManifest(json: string, file: string, opts: { root?: boolean } = {}): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ManifestError(file, `invalid JSON (${(e as Error).message})`);
  }
  if (!isPlainObject(raw)) throw new ManifestError(file, "manifest must be a JSON object");

  const name = raw.name;
  if (!opts.root || name !== undefined) {
    if (typeof name !== "string" || !isValidPackageName(name)) {
      throw new ManifestError(file, `invalid package name ${JSON.stringify(name)}`);
    }
  }

  let version = "0.0.0";
  if (raw.version !== undefined) {
    if (typeof raw.version !== "string" || !valid(raw.version)) {
      throw new ManifestError(file, `invalid version ${JSON.stringify(raw.version)}`);
    }
    version = valid(raw.version)!;
  }

  const m: Manifest = {
    name: (name as string | undefined) ?? "",
    version,
    private: raw.private === true,
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    scripts: {},
  };

  for (const kind of DEPENDENCY_KINDS) {
    const deps = raw[kind];
    if (deps === undefined) continue;
    if (!isPlainObject(deps)) throw new ManifestError(file, `"${kind}" must be an object`);
    for (const [dep, spec] of Object.entries(deps)) {
      if (!isValidPackageName(dep)) throw new ManifestError(file, `invalid dependency name "${dep}" in ${kind}`);
      if (typeof spec !== "string") throw new ManifestError(file, `dependency "${dep}" must be a string range`);
      const range = isWorkspaceProtocol(spec) ? workspaceRange(spec) : spec;
      if (validRange(range) === null) throw new ManifestError(file, `invalid range "${spec}" for "${dep}"`);
      m[kind][dep] = spec;
    }
  }

  if (raw.scripts !== undefined) {
    if (!isPlainObject(raw.scripts)) throw new ManifestError(file, `"scripts" must be an object`);
    for (const [k, v] of Object.entries(raw.scripts)) {
      if (typeof v !== "string") throw new ManifestError(file, `script "${k}" must be a string`);
      m.scripts[k] = v;
    }
  }

  if (raw.workspaces !== undefined) {
    if (!Array.isArray(raw.workspaces) || !raw.workspaces.every((w) => typeof w === "string")) {
      throw new ManifestError(file, `"workspaces" must be an array of globs`);
    }
    m.workspaces = raw.workspaces as string[];
  }

  if (raw.buildgraph !== undefined) {
    if (!isPlainObject(raw.buildgraph)) throw new ManifestError(file, `"buildgraph" must be an object`);
    m.buildgraph = raw.buildgraph;
  }

  return m;
}

/** The semver range implied by a workspace: spec ("workspace:*" -> "*"). */
export function workspaceRange(spec: string): string {
  const r = spec.slice("workspace:".length);
  return r === "^" || r === "~" ? "*" : r;
}

/** All dependency specs of a manifest, prod first. Later kinds don't override earlier ones. */
export function allDependencies(m: Manifest, kinds: DependencyKind[] = ["dependencies", "devDependencies"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of kinds) for (const [n, s] of Object.entries(m[k])) if (!(n in out)) out[n] = s;
  return out;
}
