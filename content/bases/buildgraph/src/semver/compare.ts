import { parseStrict, type PrereleaseId, type SemVer } from "./parse";

type VersionLike = string | SemVer;

const toSemVer = (v: VersionLike): SemVer => (typeof v === "string" ? parseStrict(v) : v);

/**
 * SemVer 2.0.0 §11: numeric identifiers compare numerically, alphanumeric ones
 * lexically in ASCII order, and numeric identifiers always have lower precedence.
 */
export function compareIdentifiers(a: PrereleaseId, b: PrereleaseId): number {
  const an = typeof a === "number";
  const bn = typeof b === "number";
  if (an && bn) return a === b ? 0 : (a as number) < (b as number) ? -1 : 1;
  if (an) return -1;
  if (bn) return 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

export function comparePrerelease(a: PrereleaseId[], b: PrereleaseId[]): number {
  // a version without prerelease has HIGHER precedence: 1.0.0-rc.1 < 1.0.0
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; ; i++) {
    if (i >= a.length && i >= b.length) return 0;
    if (i >= a.length) return -1; // a larger set of fields wins when all preceding are equal
    if (i >= b.length) return 1;
    const c = compareIdentifiers(a[i], b[i]);
    if (c !== 0) return c;
  }
}

export function compareMain(a: SemVer, b: SemVer): number {
  return Math.sign(a.major - b.major) || Math.sign(a.minor - b.minor) || Math.sign(a.patch - b.patch);
}

export function compare(a: VersionLike, b: VersionLike): number {
  const x = toSemVer(a);
  const y = toSemVer(b);
  return compareMain(x, y) || comparePrerelease(x.prerelease, y.prerelease);
}

export const eq = (a: VersionLike, b: VersionLike) => compare(a, b) === 0;
export const gt = (a: VersionLike, b: VersionLike) => compare(a, b) > 0;
export const gte = (a: VersionLike, b: VersionLike) => compare(a, b) >= 0;
export const lt = (a: VersionLike, b: VersionLike) => compare(a, b) < 0;
export const lte = (a: VersionLike, b: VersionLike) => compare(a, b) <= 0;

/** Returns a new array sorted ascending by precedence. */
export function sortVersions(versions: string[]): string[] {
  return [...versions].sort(compare);
}

export function rsortVersions(versions: string[]): string[] {
  return [...versions].sort((a, b) => compare(b, a));
}
