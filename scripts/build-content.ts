// Compiles content/ into data/ (one JSON bundle per problem + an index).
import fs from "node:fs";
import path from "node:path";
import { listProblemSlugs, loadProblem, ROOT, sortBundles, validateSpec } from "./content-lib";

const out = path.join(ROOT, "data");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "problems"), { recursive: true });

const bundles = [];
let bad = 0;
for (const slug of listProblemSlugs()) {
  const b = loadProblem(slug);
  const errs = validateSpec(b, slug);
  if (errs.length) {
    bad++;
    console.error(`✗ ${slug}: ${errs.join("; ")}`);
    continue;
  }
  bundles.push(b);
}

const sorted = sortBundles(bundles);
sorted.forEach((b, i) => (b.order = i + 1));
for (const b of sorted) fs.writeFileSync(path.join(out, "problems", `${b.slug}.json`), JSON.stringify(b));

const index = sorted.map(({ prompt: _p, rubric: _r, starter: _s, hidden: _h, solution: _so, ...meta }) => meta);
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 1));
console.log(`Built ${sorted.length} problems → data/ ${bad ? `(${bad} invalid skipped)` : ""}`);
if (bad) process.exitCode = 1;
