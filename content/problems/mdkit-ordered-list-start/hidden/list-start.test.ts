import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";
import { renderText } from "../../src/render/text";

const md = new Mdkit();

it("emits start only when it differs from 1, including 0", () => {
  expect(md.render("3. a\n4. b")).toBe('<ol start="3">\n<li>a</li>\n<li>b</li>\n</ol>\n');
  expect(md.render("0. zero")).toBe('<ol start="0">\n<li>zero</li>\n</ol>\n');
  expect(md.render("1. one")).toBe("<ol>\n<li>one</li>\n</ol>\n");
  expect(md.render("007) bond")).toBe('<ol start="7">\n<li>bond</li>\n</ol>\n');
  expect(md.render("- a")).toBe("<ul>\n<li>a</li>\n</ul>\n");
});

it("works for nested and loose lists", () => {
  expect(md.render("- x\n\n  5. a\n\n  6. b")).toBe(
    '<ul>\n<li>\n<p>x</p>\n<ol start="5">\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ol>\n</li>\n</ul>\n',
  );
});

it("numbers plain-text output from the start number", () => {
  expect(renderText(md.parse("9. nine\n10. ten\n    - sub"))).toBe("9. nine\n10. ten\n    - sub\n");
  expect(renderText(md.parse("0. a\n1. b"))).toBe("0. a\n1. b\n");
});
