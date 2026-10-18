import { SemverError } from "../core/errors";
import { compare } from "./compare";
import { format, parse, parsePartial, type PartialVersion, type PrereleaseId, type SemVer } from "./parse";

export type Op = ">" | ">=" | "<" | "<=" | "=";

export interface Comparator {
  op: Op;
  version: SemVer;
}

export interface RangeOptions {
  /** Let prerelease versions satisfy ranges without a same-tuple prerelease comparator. */
  includePrerelease?: boolean;
}

const sv = (major: number, minor: number, patch: number, prerelease: PrereleaseId[] = []): SemVer => ({
  major,
  minor,
  patch,
  prerelease,
  build: [],
});

// "-0" is the lowest possible prerelease, so "<2.0.0-0" excludes 2.0.0-alpha too.
const LOWEST: PrereleaseId[] = [0];

/**
 * A parsed range: a union (||) of intersections (space-separated comparators).
 * An empty intersection means "any version".
 *
 * Supported syntax: primitives (`>=1.2.3`, `<2`), x-ranges (`1.x`, `1.2`, `*`),
 * caret (`^1.2.3`), tilde (`~1.2.3`, `~>1.2`) and `||`.
 */
export class Range {
  readonly raw: string;
  readonly set: Comparator[][];

  constructor(raw: string) {
    this.raw = raw;
    this.set = raw
      .split("||")
      .map((s) => s.trim())
      .map((s) => parseIntersection(s, raw));
  }

  test(version: string | SemVer, opts: RangeOptions = {}): boolean {
    const v = typeof version === "string" ? parse(version) : version;
    if (!v) return false;
    return this.set.some((cs) => testSet(cs, v, opts));
  }

  toString(): string {
    return this.set.map((cs) => (cs.length ? cs.map(comparatorToString).join(" ") : "*")).join(" || ");
  }
}

export function comparatorToString(c: Comparator): string {
  return `${c.op === "=" ? "" : c.op}${format(c.version)}`;
}

function parseIntersection(s: string, raw: string): Comparator[] {
  // glue operators to their operand: ">= 1.2.3" -> ">=1.2.3"
  const glued = s.replace(/(~>|<=|>=|<|>|=|\^|~)\s+/g, "$1");
  if (glued === "") return [];
  const out: Comparator[] = [];
  for (const tok of glued.split(/\s+/)) out.push(...desugar(tok, raw));
  return out;
}

function bad(raw: string, tok: string): never {
  throw new SemverError(`Invalid range: "${raw}" (bad comparator "${tok}")`);
}

function partialOf(text: string, raw: string, tok: string): PartialVersion {
  const p = parsePartial(text);
  if (!p) bad(raw, tok);
  return p;
}

function desugar(tok: string, raw: string): Comparator[] {
  if (tok.startsWith("^")) return caret(partialOf(tok.slice(1), raw, tok));
  if (tok.startsWith("~>")) return tilde(partialOf(tok.slice(2), raw, tok));
  if (tok.startsWith("~")) return tilde(partialOf(tok.slice(1), raw, tok));
  const m = /^(<=|>=|<|>|=)?(.*)$/.exec(tok)!;
  const op = (m[1] ?? "=") as Op;
  return primitive(op, partialOf(m[2], raw, tok));
}

function xrange(p: PartialVersion): Comparator[] {
  if (p.major === null) return [];
  if (p.minor === null) return [{ op: ">=", version: sv(p.major, 0, 0) }, { op: "<", version: sv(p.major + 1, 0, 0, LOWEST) }];
  if (p.patch === null)
    return [{ op: ">=", version: sv(p.major, p.minor, 0) }, { op: "<", version: sv(p.major, p.minor + 1, 0, LOWEST) }];
  return [{ op: "=", version: sv(p.major, p.minor, p.patch, p.prerelease) }];
}

function caret(p: PartialVersion): Comparator[] {
  const { major: M, minor: m, patch: pt } = p;
  if (M === null) return [];
  if (m === null) return [{ op: ">=", version: sv(M, 0, 0) }, { op: "<", version: sv(M + 1, 0, 0, LOWEST) }];
  const lower: Comparator = { op: ">=", version: sv(M, m, pt ?? 0, p.prerelease) };
  let upper: SemVer;
  if (M > 0) upper = sv(M + 1, 0, 0, LOWEST);
  else if (m > 0 || pt === null) upper = sv(0, m + 1, 0, LOWEST);
  else upper = sv(0, 0, pt + 1, LOWEST);
  return [lower, { op: "<", version: upper }];
}

function tilde(p: PartialVersion): Comparator[] {
  const { major: M, minor: m, patch: pt } = p;
  if (M === null) return [];
  if (m === null) return [{ op: ">=", version: sv(M, 0, 0) }, { op: "<", version: sv(M + 1, 0, 0, LOWEST) }];
  return [
    { op: ">=", version: sv(M, m, pt ?? 0, p.prerelease) },
    { op: "<", version: sv(M, m + 1, 0, LOWEST) },
  ];
}

function primitive(op: Op, p: PartialVersion): Comparator[] {
  const { major: M, minor: m, patch: pt } = p;
  if (op === "=") return xrange(p);
  if (M === null) {
    // ">*" and "<*" can never match; ">=*" / "<=*" match everything
    return op === ">" || op === "<" ? [{ op: "<", version: sv(0, 0, 0, LOWEST) }] : [];
  }
  if (m !== null && pt !== null) return [{ op, version: sv(M, m, pt, p.prerelease) }];
  switch (op) {
    case ">":
      return [{ op: ">=", version: m === null ? sv(M + 1, 0, 0) : sv(M, m + 1, 0) }];
    case ">=":
      return [{ op: ">=", version: sv(M, m ?? 0, 0) }];
    case "<":
      return [{ op: "<", version: sv(M, m ?? 0, 0, LOWEST) }];
    case "<=":
      return [{ op: "<", version: m === null ? sv(M + 1, 0, 0, LOWEST) : sv(M, m + 1, 0, LOWEST) }];
  }
}

function testComparator(c: Comparator, v: SemVer): boolean {
  const r = compare(v, c.version);
  switch (c.op) {
    case "=":
      return r === 0;
    case ">":
      return r > 0;
    case ">=":
      return r >= 0;
    case "<":
      return r < 0;
    case "<=":
      return r <= 0;
  }
}

function testSet(cs: Comparator[], v: SemVer, opts: RangeOptions): boolean {
  if (!cs.every((c) => testComparator(c, v))) return false;
  if (v.prerelease.length === 0 || opts.includePrerelease) return true;
  // A prerelease only satisfies a range if some comparator in the same set opts in to
  // prereleases of the same [major, minor, patch] tuple. ^1.2.3-beta.1 admits
  // 1.2.3-beta.4 but not 1.3.0-beta.1.
  return cs.some(
    (c) =>
      c.version.prerelease.length > 0 &&
      c.version.major === v.major &&
      c.version.minor === v.minor &&
      c.version.patch === v.patch,
  );
}

export function satisfies(version: string | SemVer, range: string | Range, opts?: RangeOptions): boolean {
  try {
    const r = typeof range === "string" ? new Range(range) : range;
    return r.test(version, opts);
  } catch (e) {
    if (e instanceof SemverError) return false;
    throw e;
  }
}

export function maxSatisfying(versions: string[], range: string | Range, opts?: RangeOptions): string | null {
  const r = typeof range === "string" ? new Range(range) : range;
  let best: string | null = null;
  for (const v of versions) {
    if (!parse(v) || !r.test(v, opts)) continue;
    if (best === null || compare(v, best) > 0) best = v;
  }
  return best;
}

export function minSatisfying(versions: string[], range: string | Range, opts?: RangeOptions): string | null {
  const r = typeof range === "string" ? new Range(range) : range;
  let best: string | null = null;
  for (const v of versions) {
    if (!parse(v) || !r.test(v, opts)) continue;
    if (best === null || compare(v, best) < 0) best = v;
  }
  return best;
}

/** Normalized range string, or null if the range does not parse. */
export function validRange(range: string): string | null {
  try {
    return new Range(range).toString();
  } catch {
    return null;
  }
}
