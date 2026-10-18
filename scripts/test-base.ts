// Runs a base codebase's visible tests. Usage: tsx scripts/test-base.ts <base-id>
import path from "node:path";
import { runTests } from "../src/lib/runner/core";
import { sucraseTransform } from "../src/lib/runner/transform";
import { CONTENT, readTree, visibleTests } from "./content-lib";

async function main() {
  const id = process.argv[2];
  const files = readTree(path.join(CONTENT, "bases", id));
  const tests = visibleTests(files);
  const r = await runTests(files, tests, sucraseTransform);
  for (const t of r.tests) console.log(`${t.status === "pass" ? "✓" : t.status === "skip" ? "-" : "✗"} ${t.file} › ${t.name}${t.error ? `\n    ${t.error}` : ""}`);
  const loc = Object.entries(files).filter(([p]) => p.endsWith(".ts")).reduce((n, [, c]) => n + c.split("\n").length, 0);
  console.log(`\n${r.passed} passed, ${r.failed} failed — ${Object.keys(files).length} files, ${loc} lines of TS`);
  if (r.failed) process.exitCode = 1;
}
main();
