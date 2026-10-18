import type { VirtualFS } from "../vfs/vfs";
import { join } from "../utils/paths";
import { stableStringify } from "../utils/stable-json";

export interface CacheArtifact {
  /** Path relative to the package directory, e.g. "dist/index.js". */
  path: string;
  content: string;
}

export interface CacheEntry {
  hash: string;
  taskId: string;
  outputs: CacheArtifact[];
  /** Captured task log lines, replayed on a cache hit. */
  logs: string[];
  durationMs: number;
}

export interface CacheStore {
  get(hash: string): CacheEntry | undefined;
  put(entry: CacheEntry): void;
  has(hash: string): boolean;
}

export class MemoryCacheStore implements CacheStore {
  private entries = new Map<string, CacheEntry>();

  get(hash: string) {
    const e = this.entries.get(hash);
    return e && structuredCloneEntry(e);
  }
  put(entry: CacheEntry) {
    this.entries.set(entry.hash, structuredCloneEntry(entry));
  }
  has(hash: string) {
    return this.entries.has(hash);
  }
  get size() {
    return this.entries.size;
  }
  keys(): string[] {
    return [...this.entries.keys()].sort();
  }
}

function structuredCloneEntry(e: CacheEntry): CacheEntry {
  return { ...e, outputs: e.outputs.map((o) => ({ ...o })), logs: [...e.logs] };
}

/**
 * Stores entries as JSON files under `cacheDir` inside the workspace VFS. This is
 * what developers get locally; CI shares the directory between jobs, so treat its
 * contents as untrusted input.
 */
export class FsCacheStore implements CacheStore {
  constructor(
    private fs: VirtualFS,
    private dir: string,
  ) {}

  private file(hash: string) {
    return join(this.dir, `${hash}.json`);
  }

  get(hash: string): CacheEntry | undefined {
    const text = this.fs.tryRead(this.file(hash));
    if (text === undefined) return undefined;
    try {
      const e = JSON.parse(text) as CacheEntry;
      if (e.hash !== hash || !Array.isArray(e.outputs)) return undefined;
      return { ...e, logs: Array.isArray(e.logs) ? e.logs : [] };
    } catch {
      return undefined; // corrupt entry == miss
    }
  }

  put(entry: CacheEntry): void {
    this.fs.write(this.file(entry.hash), stableStringify(entry));
  }

  has(hash: string): boolean {
    return this.fs.tryRead(this.file(hash)) !== undefined;
  }
}
