import type { TaskNode } from "../graph/task-graph";
import type { VirtualFS } from "../vfs/vfs";
import { matchAny } from "../utils/glob";
import { join, relative } from "../utils/paths";
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

/** Writes a cache entry's artifacts back into the package directory. Returns written paths. */
export function restoreOutputs(fs: VirtualFS, pkgDir: string, entry: CacheEntry): string[] {
  const written: string[] = [];
  for (const a of entry.outputs) {
    const target = join(pkgDir, a.path);
    fs.write(target, a.content);
    written.push(target);
  }
  return written;
}
