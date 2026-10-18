import { SemverError } from "../core/errors";
import { format, parseStrict, type PrereleaseId, type SemVer } from "./parse";

export type ReleaseType = "major" | "minor" | "patch" | "prerelease";

export function inc(version: string, release: ReleaseType, preid?: string): string {
  const v = parseStrict(version);
  const pre = [...v.prerelease];
  const out: SemVer = { major: v.major, minor: v.minor, patch: v.patch, prerelease: [], build: [] };
  switch (release) {
    case "major":
      if (!(pre.length && v.minor === 0 && v.patch === 0)) {
        out.major++;
        out.minor = 0;
        out.patch = 0;
      }
      break;
    case "minor":
      if (!(pre.length && v.patch === 0)) {
        out.minor++;
        out.patch = 0;
      }
      break;
    case "patch":
      if (!pre.length) out.patch++;
      break;
    case "prerelease":
      if (!pre.length) {
        out.patch++;
        out.prerelease = preid ? [preid, 0] : [0];
      } else if (preid && pre[0] !== preid) {
        out.prerelease = [preid, 0];
      } else {
        out.prerelease = bumpRightmostNumeric(pre);
      }
      break;
    default:
      throw new SemverError(`Invalid release type: "${release}"`);
  }
  return format(out);
}

function bumpRightmostNumeric(ids: PrereleaseId[]): PrereleaseId[] {
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i];
    if (typeof id === "number") return [...ids.slice(0, i), id + 1, ...ids.slice(i + 1)];
  }
  return [...ids, 0];
}
