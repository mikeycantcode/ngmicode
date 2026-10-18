import { compare } from "../semver/compare";
import { byString } from "../utils/collections";
import { parseLockKey, type Lockfile } from "./lockfile";

export interface LockfileDiff {
  added: { name: string; version: string }[];
  removed: { name: string; version: string }[];
  changed: { name: string; from: string; to: string }[];
  integrityChanged: { name: string; version: string }[];
}

/** name -> version -> integrity (first key in sorted order wins). */
function index(lock: Lockfile | null): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  if (!lock) return out;
  for (const key of Object.keys(lock.packages).sort(byString)) {
    const { name } = parseLockKey(key);
    const entry = lock.packages[key];
    const versions = out.get(name) ?? new Map<string, string>();
    if (!versions.has(entry.version)) versions.set(entry.version, entry.integrity);
    out.set(name, versions);
  }
  return out;
}

const byNameThenVersion = (a: { name: string; version: string }, b: { name: string; version: string }) =>
  byString(a.name, b.name) || compare(a.version, b.version);

export function diffLockfiles(prev: Lockfile | null, next: Lockfile): LockfileDiff {
  const a = index(prev);
  const b = index(next);
  const diff: LockfileDiff = { added: [], removed: [], changed: [], integrityChanged: [] };
  const names = [...new Set([...a.keys(), ...b.keys()])].sort(byString);
  for (const name of names) {
    const before = a.get(name) ?? new Map<string, string>();
    const after = b.get(name) ?? new Map<string, string>();
    const gone = [...before.keys()].filter((v) => !after.has(v));
    const fresh = [...after.keys()].filter((v) => !before.has(v));
    if (gone.length === 1 && fresh.length === 1) {
      diff.changed.push({ name, from: gone[0], to: fresh[0] });
    } else {
      for (const version of gone) diff.removed.push({ name, version });
      for (const version of fresh) diff.added.push({ name, version });
    }
    for (const [version, integrity] of before) {
      if (after.has(version) && after.get(version) !== integrity) diff.integrityChanged.push({ name, version });
    }
  }
  diff.added.sort(byNameThenVersion);
  diff.removed.sort(byNameThenVersion);
  diff.integrityChanged.sort(byNameThenVersion);
  diff.changed.sort((x, y) => byString(x.name, y.name));
  return diff;
}
