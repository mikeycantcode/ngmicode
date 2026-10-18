import { SemverError } from "../core/errors";

export type PrereleaseId = string | number;

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers; numeric ones are stored as numbers. */
  prerelease: PrereleaseId[];
  build: string[];
}

const NUM = "0|[1-9]\\d*";
const IDENT = "(?:0|[1-9]\\d*|\\d*[a-zA-Z-][a-zA-Z0-9-]*)";
const FULL = new RegExp(
  `^v?=?\\s*(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${IDENT}(?:\\.${IDENT})*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`,
);

function toId(s: string): PrereleaseId {
  return /^\d+$/.test(s) ? Number(s) : s;
}

/** Parses a full `MAJOR.MINOR.PATCH[-pre][+build]` version. Returns null if invalid. */
export function parse(input: string): SemVer | null {
  if (typeof input !== "string") return null;
  const m = FULL.exec(input.trim());
  if (!m) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return {
    major,
    minor,
    patch,
    prerelease: m[4] ? m[4].split(".").map(toId) : [],
    build: m[5] ? m[5].split(".") : [],
  };
}

export function parseStrict(input: string): SemVer {
  const v = parse(input);
  if (!v) throw new SemverError(`Invalid version: "${input}"`);
  return v;
}

export function valid(input: string): string | null {
  const v = parse(input);
  return v ? format(v) : null;
}

/** Canonical string form. Build metadata is dropped (it never affects precedence). */
export function format(v: SemVer): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  return v.prerelease.length ? `${base}-${v.prerelease.join(".")}` : base;
}

export function isPrerelease(input: string | SemVer): boolean {
  const v = typeof input === "string" ? parse(input) : input;
  return !!v && v.prerelease.length > 0;
}

/**
 * A partial version as written in ranges: "1", "1.2", "1.x", "*", "1.2.3-beta".
 * Missing / wildcard parts are null.
 */
export interface PartialVersion {
  major: number | null;
  minor: number | null;
  patch: number | null;
  prerelease: PrereleaseId[];
}

const XR = "(?:0|[1-9]\\d*|x|X|\\*)";
const PARTIAL = new RegExp(`^v?=?(${XR})(?:\\.(${XR})(?:\\.(${XR})(?:-(${IDENT}(?:\\.${IDENT})*))?(?:\\+[0-9A-Za-z.-]+)?)?)?$`);

export function parsePartial(input: string): PartialVersion | null {
  const s = input.trim();
  if (s === "" || s === "*" || s === "x" || s === "X") return { major: null, minor: null, patch: null, prerelease: [] };
  const m = PARTIAL.exec(s);
  if (!m) return null;
  const num = (x: string | undefined) => (x === undefined || /^[xX*]$/.test(x) ? null : Number(x));
  const major = num(m[1]);
  const minor = major === null ? null : num(m[2]);
  const patch = minor === null ? null : num(m[3]);
  return { major, minor, patch, prerelease: patch !== null && m[4] ? m[4].split(".").map(toId) : [] };
}
