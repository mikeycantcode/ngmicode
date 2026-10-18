import { it, expect } from "testkit";
import { createProcessor } from "../../src/api/processor";
import { Slugger } from "../../src/render/slugger";

function changelog(releases: number): string {
  const out: string[] = ["# Changelog", ""];
  for (let i = releases; i > 0; i--) {
    out.push(`## v1.${i}.0`, "", "### Fixed", "", `- fix ${i}a`, `- fix ${i}b`, "", "### Added", "", `Release ${i} notes.`, "");
  }
  return out.join("\n");
}

it("renders a large changelog within budget", () => {
  const src = changelog(1000); // ~11k lines, 2000 duplicate sub-headings
  const t0 = Date.now();
  const res = createProcessor().process(src);
  const ms = Date.now() - t0;
  expect(ms).toBeLessThan(300);
  expect(res.html).toContain('<h3 id="fixed-999">Fixed</h3>');
  expect(res.html).toContain('<h3 id="added-999">Added</h3>');
  expect(res.ast.children[res.ast.children.length - 1].position).toEqual({ line: src.split("\n").length - 1 });
});

it("keeps slug de-duplication semantics", () => {
  const s = new Slugger();
  const got = ["Fixed", "Fixed", "Fixed 1", "Fixed", "Fixed-2", "Fixed 1"].map((t) => s.slug(t));
  expect(got).toEqual(["fixed", "fixed-1", "fixed-1-1", "fixed-2", "fixed-2-1", "fixed-1-2"]);
  s.reset();
  expect(s.slug("Fixed")).toBe("fixed");
});
