import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";

const md = new Mdkit();

it("keeps blank-separated items in one loose list", () => {
  expect(md.render("1. Install\n\n2. Configure\n\n3. Run")).toBe(
    "<ol>\n<li>\n<p>Install</p>\n</li>\n<li>\n<p>Configure</p>\n</li>\n<li>\n<p>Run</p>\n</li>\n</ol>\n",
  );
});

it("makes the whole list loose if any two items are separated by a blank line", () => {
  expect(md.render("- a\n- b\n\n- c")).toBe(
    "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ul>\n",
  );
});

it("still ends the list before an unindented paragraph or a different list type (#212)", () => {
  expect(md.render("- a\n- b\n\nafter")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<p>after</p>\n");
  expect(md.render("- a\n\n* b")).toBe("<ul>\n<li>a</li>\n</ul>\n<ul>\n<li>b</li>\n</ul>\n");
  expect(md.render("1. a\n\n2) b")).toBe("<ol>\n<li>a</li>\n</ol>\n<ol>\n<li>b</li>\n</ol>\n");
});

it("keeps nested lists inside their parent item across blank lines", () => {
  expect(md.render("1. a\n\n   - x\n\n   - y\n\n2. b")).toBe(
    "<ol>\n<li>\n<p>a</p>\n<ul>\n<li>\n<p>x</p>\n</li>\n<li>\n<p>y</p>\n</li>\n</ul>\n</li>\n<li>\n<p>b</p>\n</li>\n</ol>\n",
  );
});
