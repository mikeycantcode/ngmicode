// Verifies problems: the reference solution passes every test, and the starter
// fails at least one hidden test. Usage: tsx scripts/verify-content.ts [slug|base:<id>]...
import { runTests } from "../src/lib/runner/core";
import { sucraseTransform } from "../src/lib/runner/transform";
import { listProblemSlugs, loadProblem, validateSpec, visibleTests } from "./content-lib";
import fs from "node:fs";

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("-v");
  const filters = args.filter((a) => a !== "-v");
  let slugs = listProblemSlugs();
  if (filters.length) {
    slugs = slugs.filter((s) =>
      filters.some((f) => {
        if (f.startsWith("base:")) {
          const spec = JSON.parse(fs.readFileSync(`content/problems/${s}/problem.json`, "utf8"));
          return spec.base === f.slice(5);
        }
        return s === f || s.startsWith(f);
      }),
    );
  }

  let failures = 0;
  for (const slug of slugs) {
    const problems: string[] = [];
    const warnings: string[] = [];
    let p;
    try {
      p = loadProblem(slug);
    } catch (e) {
      console.log(`✗ ${slug}\n    load error: ${(e as Error).message}`);
      failures++;
      continue;
    }
    problems.push(...validateSpec(p, slug));
    const hiddenFiles = Object.keys(p.hidden);
    if (!hiddenFiles.length) problems.push("no hidden tests");
    if (!Object.keys(p.solution).length) problems.push("no solution files");

    const starterAll = { ...p.starter, ...p.hidden };
    const solvedAll = { ...p.starter, ...p.solution, ...p.hidden };

    const starterHidden = await runTests(starterAll, hiddenFiles, sucraseTransform);
    const starterVisible = await runTests(starterAll, visibleTests(p.starter), sucraseTransform);
    const solvedHidden = await runTests(solvedAll, hiddenFiles, sucraseTransform);
    const solvedVisible = await runTests(solvedAll, visibleTests({ ...p.starter, ...p.solution }), sucraseTransform);

    const fails = (r: typeof solvedHidden) => r.tests.filter((t) => t.status === "fail");
    if (fails(solvedHidden).length) problems.push(`solution fails hidden: ${fails(solvedHidden).map((t) => `${t.name} — ${t.error}`).join(" | ")}`);
    if (fails(solvedVisible).length) problems.push(`solution fails visible: ${fails(solvedVisible).map((t) => `${t.file}: ${t.name} — ${t.error}`).join(" | ")}`);
    if (solvedHidden.passed === 0) problems.push("solution passes zero hidden tests");
    if (!p.starterPasses && fails(starterHidden).length === 0) problems.push("starter already passes all hidden tests");
    if (fails(starterVisible).length) warnings.push(`starter fails ${fails(starterVisible).length} visible test(s)`);

    const ok = problems.length === 0;
    if (!ok) failures++;
    const line = `${ok ? "✓" : "✗"} ${slug}  [hidden starter ${starterHidden.passed}/${starterHidden.tests.length}, solution ${solvedHidden.passed}/${solvedHidden.tests.length}; visible solution ${solvedVisible.passed}/${solvedVisible.tests.length}]`;
    console.log(line);
    for (const pr of problems) console.log(`    ✗ ${pr}`);
    if (verbose || !ok) for (const w of warnings) console.log(`    ! ${w}`);
  }
  console.log(`\n${slugs.length - failures}/${slugs.length} problems verified`);
  if (failures) process.exitCode = 1;
}

main();
