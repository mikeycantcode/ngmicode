import { ManifestError } from "../core/errors";
import type { VirtualFS } from "../vfs/vfs";
import { matchGlob } from "../utils/glob";
import { dirname, join } from "../utils/paths";
import { byString } from "../utils/collections";
import { parseManifest, type Manifest } from "./manifest";

export interface WorkspacePackage {
  name: string;
  /** Root-relative directory, e.g. "packages/ui". */
  dir: string;
  manifest: Manifest;
}

export interface Workspace {
  root: Manifest;
  /** Packages keyed by name, iteration order sorted by name. */
  packages: Map<string, WorkspacePackage>;
}

export const MANIFEST_FILE = "package.json";

/**
 * Discovers workspace packages: every `package.json` (other than the root one) whose
 * directory matches one of the root manifest's `workspaces` globs.
 */
export function loadWorkspace(fs: VirtualFS): Workspace {
  const rootText = fs.tryRead(MANIFEST_FILE);
  if (rootText === undefined) throw new ManifestError(MANIFEST_FILE, "root manifest not found");
  const root = parseManifest(rootText, MANIFEST_FILE, { root: true });
  const globs = root.workspaces ?? [];

  const found: WorkspacePackage[] = [];
  for (const file of fs.list()) {
    if (file === MANIFEST_FILE || !file.endsWith("/" + MANIFEST_FILE)) continue;
    const dir = dirname(file);
    if (dir.split("/").includes("node_modules")) continue;
    if (!globs.some((g) => matchGlob(g.replace(/\/$/, ""), dir))) continue;
    const manifest = parseManifest(fs.read(file), file);
    found.push({ name: manifest.name, dir, manifest });
  }

  found.sort((a, b) => byString(a.name, b.name));
  const packages = new Map<string, WorkspacePackage>();
  for (const p of found) {
    const prev = packages.get(p.name);
    if (prev) {
      throw new ManifestError(join(p.dir, MANIFEST_FILE), `duplicate package name "${p.name}" (also in ${prev.dir})`);
    }
    packages.set(p.name, p);
  }
  return { root, packages };
}

export function getPackage(ws: Workspace, name: string): WorkspacePackage {
  const p = ws.packages.get(name);
  if (!p) throw new ManifestError(MANIFEST_FILE, `unknown workspace package "${name}"`);
  return p;
}

export function packageNames(ws: Workspace): string[] {
  return [...ws.packages.keys()];
}
