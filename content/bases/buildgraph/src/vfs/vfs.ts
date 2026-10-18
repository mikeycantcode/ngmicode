import { VfsError } from "../core/errors";
import { matchGlob } from "../utils/glob";
import { isWithin, normalize, relative } from "../utils/paths";

/**
 * Filesystem abstraction used by every layer. Paths are root-relative POSIX paths.
 * Directories are implicit: a directory "exists" if any file lives under it.
 */
export interface VirtualFS {
  read(path: string): string;
  tryRead(path: string): string | undefined;
  write(path: string, content: string): void;
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  delete(path: string): boolean;
  /** All files under `dir` (recursive), sorted, as root-relative paths. */
  list(dir?: string): string[];
  /** Files under `cwd` whose cwd-relative path matches `pattern`. Returns root-relative paths. */
  glob(pattern: string, cwd?: string): string[];
}

function clean(path: string): string {
  const n = normalize(path);
  const p = n.startsWith("/") ? n.slice(1) : n;
  if (p.startsWith("..")) throw new VfsError(`Path escapes workspace root: ${path}`);
  return p;
}

export class MemoryFS implements VirtualFS {
  private files = new Map<string, string>();
  private sortedCache: string[] | null = null;

  constructor(initial: Record<string, string> = {}) {
    for (const [p, c] of Object.entries(initial)) this.write(p, c);
  }

  read(path: string): string {
    const c = this.files.get(clean(path));
    if (c === undefined) throw new VfsError(`ENOENT: ${path}`);
    return c;
  }

  tryRead(path: string): string | undefined {
    return this.files.get(clean(path));
  }

  write(path: string, content: string): void {
    const p = clean(path);
    if (p === "") throw new VfsError("Cannot write to workspace root");
    if (!this.files.has(p)) this.sortedCache = null;
    this.files.set(p, content);
  }

  exists(path: string): boolean {
    const p = clean(path);
    return this.files.has(p) || this.isDirectory(p);
  }

  isDirectory(path: string): boolean {
    const p = clean(path);
    if (p === "") return this.files.size > 0;
    for (const f of this.files.keys()) if (f.startsWith(p + "/")) return true;
    return false;
  }

  delete(path: string): boolean {
    const p = clean(path);
    const had = this.files.delete(p);
    if (had) this.sortedCache = null;
    return had;
  }

  list(dir = ""): string[] {
    const d = clean(dir);
    if (!this.sortedCache) this.sortedCache = [...this.files.keys()].sort();
    if (d === "") return [...this.sortedCache];
    return this.sortedCache.filter((f) => isWithin(d, f) && f !== d);
  }

  glob(pattern: string, cwd = ""): string[] {
    const d = clean(cwd);
    return this.list(d).filter((f) => matchGlob(pattern, d ? relative(d, f) : f));
  }

  toRecord(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.list()) out[f] = this.files.get(f)!;
    return out;
  }
}

/**
 * Wraps a VirtualFS and records which paths were written or deleted since the last
 * `mark()`. Used by `buildgraph affected --since-mark` and by tests that simulate a
 * developer editing files between runs.
 */
export class TrackedFS implements VirtualFS {
  private changed = new Set<string>();

  constructor(private inner: VirtualFS) {}

  mark(): void {
    this.changed.clear();
  }

  changedSinceMark(): string[] {
    return [...this.changed].sort();
  }

  read(path: string) {
    return this.inner.read(path);
  }
  tryRead(path: string) {
    return this.inner.tryRead(path);
  }
  write(path: string, content: string) {
    const before = this.inner.tryRead(path);
    this.inner.write(path, content);
    if (before !== content) this.changed.add(normalize(path).replace(/^\//, ""));
  }
  exists(path: string) {
    return this.inner.exists(path);
  }
  isDirectory(path: string) {
    return this.inner.isDirectory(path);
  }
  delete(path: string) {
    const had = this.inner.delete(path);
    if (had) this.changed.add(normalize(path).replace(/^\//, ""));
    return had;
  }
  list(dir?: string) {
    return this.inner.list(dir);
  }
  glob(pattern: string, cwd?: string) {
    return this.inner.glob(pattern, cwd);
  }
}
