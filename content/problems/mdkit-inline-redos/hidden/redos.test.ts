import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";

const md = new Mdkit();
const BUDGET_MS = 400;

function timed(src: string): { html: string; ms: number } {
  const t0 = Date.now();
  const html = md.render(src);
  return { html, ms: Date.now() - t0 };
}

it("handles long runs of inner whitespace quickly (fuzzer case 1)", () => {
  const sp = " ".repeat(40000);
  const r = timed("a" + sp + "b\nnext line\n\nfoo" + sp + "bar");
  expect(r.ms).toBeLessThan(BUDGET_MS);
  // Behavior unchanged: hard breaks need 2+ trailing spaces, trailing space is trimmed.
  expect(md.render("a  \nb\nc \nd   ")).toBe("<p>a<br>\nb\nc\nd</p>\n");
});

it("handles thousands of unmatched closing delimiters quickly (fuzzer case 2)", () => {
  const r = timed("a* ".repeat(40000) + "\n\n" + "b_ ".repeat(40000));
  expect(r.ms).toBeLessThan(BUDGET_MS);
  expect(md.render("*foo**bar*")).toBe("<p><em>foo**bar</em></p>\n");
  expect(md.render("**foo*bar*baz**")).toBe("<p><strong>foo<em>bar</em>baz</strong></p>\n");
  expect(md.render("*a **b** c* _x_ a* b*")).toBe("<p><em>a <strong>b</strong> c</em> <em>x</em> a* b*</p>\n");
});

it("handles reference definitions with long whitespace runs quickly (fuzzer case 3)", () => {
  const sp = " ".repeat(20000);
  const r = timed("[a]:" + sp + "/url" + sp + "x\n\n[a]");
  expect(r.ms).toBeLessThan(BUDGET_MS);
  expect(md.render('[x]: /u "T"\n[y]:\n  /v\n  \'W\'\n\n[x] [y]')).toBe('<p><a href="/u" title="T">x</a> <a href="/v" title="W">y</a></p>\n');
  expect(md.render("[z]: /w trailing junk\n\n[z]")).toBe("<p>[z]: /w trailing junk</p>\n<p>[z]</p>\n");
});
