import { it, expect } from "testkit";
import { createProcessor } from "../../src/api/processor";

const DOC = [
  "Alpha[^b] and beta[^a].",
  "",
  "[^a]: Note *A* with [a link](https://x.io).",
  "[^b]: Note B",
  "continues here.",
  "",
  "## Next",
  "",
  "Again[^a]. Unknown[^nope]. Plain [text].",
  "",
  "[^unused]: Never referenced.",
].join("\n");

it("numbers notes by first reference and renders refs and the section", () => {
  const { html } = createProcessor({ footnotes: true }).process(DOC);
  expect(html).toContain('Alpha<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup> and beta<sup class="footnote-ref"><a href="#fn-2" id="fnref-2">2</a></sup>.');
  expect(html).toContain('<section class="footnotes">\n<ol>\n<li id="fn-1">\n<p>Note B\ncontinues here. <a href="#fnref-1" class="footnote-backref">↩</a></p>\n</li>\n');
  expect(html).toContain('<li id="fn-2">\n<p>Note <em>A</em> with <a href="https://x.io">a link</a>');
  // Definitions are not rendered in place, and the section comes last.
  expect(html.indexOf("Note B")).toBeGreaterThan(html.indexOf('<h2 id="next">'));
  expect(html.trimEnd().endsWith("</section>")).toBe(true);
});

it("handles repeated, unknown and unused notes", () => {
  const { html } = createProcessor({ footnotes: true }).process(DOC);
  expect(html).toContain('Again<sup class="footnote-ref"><a href="#fn-2" id="fnref-2-2">2</a></sup>.');
  expect(html).toContain('<a href="#fnref-2" class="footnote-backref">↩</a> <a href="#fnref-2-2" class="footnote-backref">↩</a></p>');
  expect(html).toContain("Unknown[^nope]. Plain [text].");
  expect(html).not.toContain("Never referenced");
  expect(html).not.toContain('id="fn-3"');
});

it("works with the text renderer and restarts numbering per document", () => {
  const p = createProcessor({ footnotes: true });
  const first = p.process(DOC);
  expect(first.text).toContain("Alpha[1] and beta[2].");
  expect(first.text).toContain("[1] Note B continues here.\n[2] Note A with a link.");
  const second = p.process("Only[^z].\n\n[^z]: Zed.");
  expect(second.html).toContain('<a href="#fn-1" id="fnref-1">1</a>');
  expect(second.html).toContain('<li id="fn-1">');
});

it("is off by default", () => {
  const { html } = createProcessor().process("Alpha[^1].\n\n[^1]: Note.");
  expect(html).not.toContain("footnote");
});
