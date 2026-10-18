import { ResolveError } from "../core/errors";
import { isPlainObject } from "../utils/collections";
import { stableStringify } from "../utils/stable-json";

export const LOCKFILE_NAME = "buildgraph.lock";
export const LOCKFILE_VERSION = 1;

export interface LockEntry {
  version: string;
  integrity: string;
  dependencies: Record<string, string>;
}

/**
 * Lockfile entries are keyed by the *requested* spec ("react@^18.0.0"), so the same
 * package can appear several times, resolved to the same or different versions.
 */
export interface Lockfile {
  lockfileVersion: number;
  packages: Record<string, LockEntry>;
}

export function lockKey(name: string, spec: string): string {
  return `${name}@${spec}`;
}

/** Splits "@scope/name@^1.0.0" into name and spec (the separator is the last "@" after index 0). */
export function parseLockKey(key: string): { name: string; spec: string } {
  const i = key.indexOf("@", 1);
  if (i < 0) throw new ResolveError(`Invalid lockfile key "${key}"`);
  return { name: key.slice(0, i), spec: key.slice(i + 1) };
}

export function emptyLockfile(): Lockfile {
  return { lockfileVersion: LOCKFILE_VERSION, packages: {} };
}

/** Deterministic text form: sorted keys, 2-space indent, trailing newline. */
export function serializeLockfile(lock: Lockfile): string {
  return stableStringify(lock, 2) + "\n";
}

export function parseLockfile(text: string): Lockfile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ResolveError(`${LOCKFILE_NAME}: invalid JSON (${(e as Error).message})`);
  }
  if (!isPlainObject(raw) || !isPlainObject(raw.packages)) throw new ResolveError(`${LOCKFILE_NAME}: malformed`);
  if (raw.lockfileVersion !== LOCKFILE_VERSION) {
    throw new ResolveError(`${LOCKFILE_NAME}: unsupported lockfileVersion ${JSON.stringify(raw.lockfileVersion)}`);
  }
  const packages: Record<string, LockEntry> = {};
  for (const [key, e] of Object.entries(raw.packages)) {
    parseLockKey(key);
    if (!isPlainObject(e) || typeof e.version !== "string" || typeof e.integrity !== "string") {
      throw new ResolveError(`${LOCKFILE_NAME}: malformed entry "${key}"`);
    }
    packages[key] = {
      version: e.version,
      integrity: e.integrity,
      dependencies: isPlainObject(e.dependencies) ? (e.dependencies as Record<string, string>) : {},
    };
  }
  return { lockfileVersion: LOCKFILE_VERSION, packages };
}
