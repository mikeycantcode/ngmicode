import { describe, it, expect } from "testkit";
import { createEnv, DEFAULT_PARSE_OPTIONS, Mdkit, parseBlocks } from "../src/index";
import type { List, Root } from "../src/index";

const blocks = (src: string, opts = {}): Root => parseBlocks(src, { ...DEFAULT_PARSE_OPTIONS, ...opts }, createEnv());
const html = (src: string, opts = {}) => new Mdkit(opts).render(src);

describe("headings", () => {
  it("parses ATX headings and strips closing hashes", () => {
    const root = blocks("# One\n### Three ###\n#NotAHeading");
    expect(root.children.map((n) => n.type)).toEqual(["heading", "heading", "paragraph"]);
    expect(root.children[1]).toMatchObject({ depth: 3, raw: "Three" });
  });

  it("parses setext headings", () => {
    expect(html("Title\n=====\n\nSub\n---")).toBe("<h1>Title</h1>\n<h2>Sub</h2>\n");
  });

  it("records source lines", () => {
    const root = blocks("para\n\n# H");
    expect(root.children[1].position).toEqual({ line: 3 });
  });
});

describe("code fences", () => {
  it("keeps content verbatim and takes lang from the info string", () => {
    const root = blocks("```ts title=a.ts\nconst a = 1;\n\n  indented\n```");
    expect(root.children[0]).toMatchObject({ type: "code", lang: "ts", info: "ts title=a.ts", value: "const a = 1;\n\n  indented\n" });
  });

  it("needs a closing fence of the same char and at least the same length", () => {
    const root = blocks("````\n```\n~~~~\n````\nafter");
    expect(root.children[0]).toMatchObject({ type: "code", value: "```\n~~~~\n" });
    expect(root.children[1].type).toBe("paragraph");
  });

  it("runs an unclosed fence to the end", () => {
    expect(blocks("~~~\na\nb").children[0]).toMatchObject({ type: "code", value: "a\nb\n" });
  });
});

describe("thematic breaks and blockquotes", () => {
  it("recognises breaks", () => {
    expect(blocks("***\n- - -\n___").children.map((n) => n.type)).toEqual(["thematicBreak", "thematicBreak", "thematicBreak"]);
  });

  it("supports nesting and lazy continuation", () => {
    expect(html("> a\nb\n> > c")).toBe("<blockquote>\n<p>a\nb</p>\n<blockquote>\n<p>c</p>\n</blockquote>\n</blockquote>\n");
  });
});

describe("lists", () => {
  it("renders tight bullet lists without <p>", () => {
    expect(html("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n");
  });

  it("nests by indentation", () => {
    expect(html("- a\n  - b\n- c")).toBe("<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n<li>c</li>\n</ul>\n");
  });

  it("ends the list at a blank line (#212)", () => {
    expect(html("1. a\n\n2. b")).toBe("<ol>\n<li>a</li>\n</ol>\n<ol>\n<li>b</li>\n</ol>\n");
  });

  it("ends the list at a blank line followed by an unindented paragraph", () => {
    const root = blocks("- a\n\nafter");
    expect(root.children.map((n) => n.type)).toEqual(["list", "paragraph"]);
    expect((root.children[0] as List).tight).toBe(true);
  });

  it("starts a new list when the bullet character changes", () => {
    expect(blocks("- a\n* b").children).toHaveLength(2);
  });

  it("records the ordered start number", () => {
    expect(blocks("7) x\n8) y").children[0]).toMatchObject({ type: "list", ordered: true, start: 7, marker: ")" });
  });

  it("only lets an ordered list starting at 1 interrupt a paragraph", () => {
    expect(blocks("text\n2. not a list").children).toHaveLength(1);
    expect(blocks("text\n1. a list").children.map((n) => n.type)).toEqual(["paragraph", "list"]);
  });

  it("keeps fenced code inside items", () => {
    expect(html("- a\n\n  ```\n  code\n  ```")).toBe("<ul>\n<li>\n<p>a</p>\n<pre><code>code\n</code></pre>\n</li>\n</ul>\n");
  });
});

describe("tables", () => {
  it("parses alignment and pads short rows", () => {
    const root = blocks("| a | b | c |\n|:--|:-:|--:|\n| 1 |");
    expect(root.children[0]).toMatchObject({ type: "table", align: ["left", "center", "right"] });
    const t = root.children[0] as Extract<Root["children"][number], { type: "table" }>;
    expect(t.children[1].children.map((c) => c.raw)).toEqual(["1", "", ""]);
  });

  it("treats \\| as a literal pipe", () => {
    expect(html("a | b\n--|--\n`x\\|y` | z")).toContain("<td><code>x|y</code></td>");
  });

  it("requires matching header and delimiter widths", () => {
    expect(blocks("a | b\n--|--|--").children[0].type).toBe("paragraph");
  });

  it("can be disabled", () => {
    expect(blocks("a | b\n--|--", { tables: false }).children[0].type).toBe("paragraph");
  });
});

describe("raw HTML", () => {
  it("is escaped by default", () => {
    expect(html("<div>\nhi\n</div>")).toBe("<p>&lt;div&gt;\nhi\n&lt;/div&gt;</p>\n");
  });

  it("passes through with html: true", () => {
    expect(html("<div>\nhi\n</div>\n\npara", { html: true })).toBe("<div>\nhi\n</div>\n<p>para</p>\n");
  });
});

describe("link reference definitions", () => {
  it("are removed from the output and the first definition wins", () => {
    const env = createEnv();
    const root = parseBlocks('[a]: /one "One"\n[A]: /two\n\npara', DEFAULT_PARSE_OPTIONS, env);
    expect(root.children).toHaveLength(1);
    expect(env.references.get("a")).toEqual({ href: "/one", title: "One" });
  });
});
