import fs from "node:fs";
import path from "node:path";
import type { FileMap, ProblemBundle, ProblemSpec } from "../src/lib/content-types";
import { CATEGORIES, TRACKS } from "../src/lib/taxonomy";
import { isTestFile } from "../src/lib/runner/core";

export const ROOT = path.resolve(__dirname, "..");
export const CONTENT = path.join(ROOT, "content");

const IGNORE = new Set([".DS_Store", "node_modules"]);

export function readTree(dir: string): FileMap {
  const out: FileMap = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORE.has(ent.name)) continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else out[path.relative(dir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  };
  walk(dir);
  return out;
}

export function hiddenPath(name: string) {
  return `tests/hidden/${name}`;
}

const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

export function listProblemSlugs(): string[] {
  const dir = path.join(CONTENT, "problems");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((s) => fs.existsSync(path.join(dir, s, "problem.json")));
}

export function validateSpec(spec: ProblemSpec, slug: string): string[] {
  const errs: string[] = [];
  if (spec.slug !== slug) errs.push(`slug mismatch: ${spec.slug} vs folder ${slug}`);
  if (!TRACKS[spec.track]) errs.push(`unknown track ${spec.track}`);
  if (!CATEGORIES.find((c) => c.id === spec.category)) errs.push(`unknown category ${spec.category}`);
  if (!["easy", "medium", "hard"].includes(spec.difficulty)) errs.push(`bad difficulty ${spec.difficulty}`);
  if (![15, 20, 30, 45, 60].includes(spec.timeLimit)) errs.push(`timeLimit must be 15/20/30/45/60`);
  if (!fs.existsSync(path.join(CONTENT, "bases", spec.base))) errs.push(`unknown base ${spec.base}`);
  if (!spec.title || !spec.summary) errs.push(`missing title/summary`);
  return errs;
}

export function loadProblem(slug: string): ProblemBundle {
  const dir = path.join(CONTENT, "problems", slug);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, "problem.json"), "utf8")) as ProblemSpec;
  const base = readTree(path.join(CONTENT, "bases", spec.base));
  const overlay = readTree(path.join(dir, "overlay"));
  const starter: FileMap = { ...base, ...overlay };
  for (const r of spec.remove ?? []) delete starter[r];
  const hiddenRaw = readTree(path.join(dir, "hidden"));
  const hidden: FileMap = {};
  for (const [k, v] of Object.entries(hiddenRaw)) hidden[hiddenPath(k)] = v;
  const solution = readTree(path.join(dir, "solution"));
  const prompt = fs.readFileSync(path.join(dir, "prompt.md"), "utf8");
  const rubric = fs.existsSync(path.join(dir, "rubric.md")) ? fs.readFileSync(path.join(dir, "rubric.md"), "utf8") : "";
  const loc = Object.entries(starter)
    .filter(([p]) => /\.(ts|js|tsx)$/.test(p))
    .reduce((n, [, c]) => n + c.split("\n").length, 0);
  return {
    ...spec,
    order: 0,
    fileCount: Object.keys(starter).length,
    loc,
    hiddenTestCount: Object.values(hidden).reduce((n, c) => n + (c.match(/\b(it|test)\(/g)?.length ?? 0), 0),
    prompt,
    rubric,
    starter,
    hidden,
    solution,
  };
}

export function sortBundles<T extends { category: string; difficulty: keyof typeof DIFF_ORDER; slug: string }>(list: T[]): T[] {
  const catIdx = Object.fromEntries(CATEGORIES.map((c, i) => [c.id, i]));
  return [...list].sort(
    (a, b) => catIdx[a.category] - catIdx[b.category] || DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || a.slug.localeCompare(b.slug),
  );
}

export function visibleTests(files: FileMap) {
  return Object.keys(files).filter((p) => isTestFile(p) && !p.startsWith("tests/hidden/"));
}
