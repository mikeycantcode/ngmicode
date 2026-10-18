import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ProblemBundle, ProblemMeta } from "./content-types";

const DATA = path.join(process.cwd(), "data");

let indexCache: ProblemMeta[] | null = null;
const bundleCache = new Map<string, ProblemBundle>();

export function listProblems(): ProblemMeta[] {
  if (!indexCache || process.env.NODE_ENV !== "production") {
    const file = path.join(DATA, "index.json");
    indexCache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as ProblemMeta[]) : [];
    indexCache = indexCache.filter((p) => !p.slug.startsWith("_"));
  }
  return indexCache;
}

export function getProblem(slug: string): ProblemBundle | null {
  if (!/^[a-z0-9_-]+$/.test(slug)) return null;
  const hit = bundleCache.get(slug);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const file = path.join(DATA, "problems", `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const b = JSON.parse(fs.readFileSync(file, "utf8")) as ProblemBundle;
  bundleCache.set(slug, b);
  return b;
}

/** Problem metadata safe for the client: the source PR (which reveals the fix) is removed. */
export function withoutSource(p: ProblemMeta): ProblemMeta {
  const copy = { ...p };
  delete copy.source;
  return copy;
}
