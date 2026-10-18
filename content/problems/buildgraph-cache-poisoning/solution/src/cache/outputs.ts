import type { TaskNode } from "../graph/task-graph";
import type { VirtualFS } from "../vfs/vfs";
import { matchAny } from "../utils/glob";
import { isWithin, join, relative } from "../utils/paths";
import type { CacheArtifact, CacheEntry } from "./cache-store";

/** Files under the package dir that match the task's `outputs` globs. */
export function collectOutputs(fs: VirtualFS, node: TaskNode): CacheArtifact[] {
  if (!node.def.outputs.length) return [];
  const out: CacheArtifact[] = [];
  for (const file of fs.list(node.dir)) {
    const rel = relative(node.dir, file);
    if (matchAny(node.def.outputs, rel)) out.push({ path: rel, content: fs.read(file) });
  }
  return out;
}

/**
 * Returns why `entry` can't be restored safely into `pkgDir`, or null if every artifact
 * stays strictly inside the package directory. Cache contents are untrusted input.
 */
export function unsafeArtifactReason(pkgDir: string, entry: CacheEntry): string | null {
  for (const a of entry.outputs) {
    const p = a.path;
    if (typeof p !== "string" || p === "") return "empty artifact path";
    if (p.startsWith("/")) return `absolute artifact path "${p}"`;
    if (p.includes("\\")) return `backslash in artifact path "${p}"`;
    const target = join(pkgDir, p);
    if (target === join(pkgDir) || !isWithin(pkgDir, target)) return `artifact path "${p}" escapes ${pkgDir}`;
  }
  return null;
}

/** Writes a cache entry's artifacts back into the package directory. Returns written paths. */
export function restoreOutputs(fs: VirtualFS, pkgDir: string, entry: CacheEntry): string[] {
  const reason = unsafeArtifactReason(pkgDir, entry);
  if (reason) throw new Error(`refusing to restore cache entry ${entry.hash}: ${reason}`);
  const written: string[] = [];
  for (const a of entry.outputs) {
    const target = join(pkgDir, a.path);
    fs.write(target, a.content);
    written.push(target);
  }
  return written;
}
