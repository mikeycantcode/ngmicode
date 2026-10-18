import { describe, it, expect } from "testkit";
import { createEnv, DEFAULT_PARSE_OPTIONS, Mdkit, parseBlocks } from "../src/index";
import type { Root, Table } from "../src/index";

const md = new Mdkit();
const blocks = (src: string): Root => parseBlocks(src, DEFAULT_PARSE_OPTIONS, createEnv());
const table = (src: string) => blocks(src).children[0] as Table;
const cells = (t: Table, row: number) => t.children[row].children.map((c) => c.raw);

describe("table detection", () => {
  it("needs a header row and a delimiter row of the same width", () => {
    expect(table("a | b\n--|--").type).toBe("table");
    expect(blocks("a | b\n--|--|--").children[0].type).toBe("paragraph");
    expect(blocks("a | b").children[0].type).toBe("paragraph");
    expect(blocks("a | b\n-- | x").children[0].type).toBe("paragraph");
  });

  it("makes leading and trailing pipes optional", () => {
    expect(cells(table("| a | b |\n|---|---|\n| 1 | 2 |"), 1)).toEqual(["1", "2"]);
    expect(cells(table("a | b\n---|---\n1 | 2"), 1)).toEqual(["1", "2"]);
  });

  it("is disabled with tables: false", () => {
    expect(parseBlocks("a | b\n--|--", { ...DEFAULT_PARSE_OPTIONS, tables: false }, createEnv()).children[0].type).toBe("paragraph");
  });
});

describe("alignment", () => {
  it("reads every alignment form, with any number of dashes and spaces", () => {
    expect(table("a | b | c | d\n:-- | :---: |  ------: | -").align).toEqual(["left", "center", "right", null]);
  });

  it("renders style attributes on th and td only when aligned", () => {
    expect(md.render("a | b\n:-:|--\n1 | 2")).toBe(
      '<table>\n<thead>\n<tr>\n<th style="text-align:center">a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td style="text-align:center">1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n',
    );
  });
});

describe("rows", () => {
  it("pads short rows and drops extra cells", () => {
    const t = table("a | b | c\n--|--|--\n1\n1 | 2 | 3 | 4");
    expect(cells(t, 1)).toEqual(["1", "", ""]);
    expect(cells(t, 2)).toEqual(["1", "2", "3"]);
    expect(md.render("a | b\n--|--\n1")).toContain("<td>1</td>\n<td></td>");
  });

  it("ends the body at a blank line or another block", () => {
    const root = blocks("a | b\n--|--\n1 | 2\n\npara\n\nc | d\n--|--\n3 | 4\n# Heading");
    expect(root.children.map((n) => n.type)).toEqual(["table", "paragraph", "table", "heading"]);
  });

  it("renders a header-only table without tbody", () => {
    expect(md.render("a | b\n--|--")).not.toContain("<tbody>");
  });
});

describe("cell content", () => {
  it("treats \\| as a literal pipe, including in code spans", () => {
    const t = table("a | b\n--|--\nx \\| y | `p\\|q`");
    expect(cells(t, 1)).toEqual(["x | y", "`p|q`"]);
    expect(md.render("a | b\n--|--\nx \\| y | `p\\|q`")).toContain("<td>x | y</td>\n<td><code>p|q</code></td>");
  });

  it("parses inline formatting in cells", () => {
    expect(md.render("a | b\n--|--\n*em* | [l](/x)")).toContain('<td><em>em</em></td>\n<td><a href="/x">l</a></td>');
  });
});
