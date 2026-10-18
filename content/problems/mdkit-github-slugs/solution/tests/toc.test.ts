import { describe, it, expect } from "testkit";
import { buildToc, Mdkit, renderTocMarkdown, Slugger, slugify } from "../src/index";

describe("slugger", () => {
  it("slugifies", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  The `render()` API  ")).toBe("the-render-api");
    expect(slugify("snake_case - kebab")).toBe("snake_case---kebab");
  });

  it("de-duplicates", () => {
    const s = new Slugger();
    expect(["Intro", "Intro", "Intro 1", "Intro"].map((t) => s.slug(t))).toEqual(["intro", "intro-1", "intro-1-1", "intro-2"]);
  });

  it("falls back for empty slugs", () => {
    const s = new Slugger();
    expect([s.slug("!!!"), s.slug("???")]).toEqual(["section", "section-1"]);
  });
});

describe("buildToc", () => {
  const md = new Mdkit();

  it("nests headings and respects depth limits", () => {
    const toc = buildToc(md.parse("# A\n## B\n#### deep\n### C\n## D"), { maxDepth: 3 });
    expect(toc).toHaveLength(1);
    expect(toc[0].children.map((c) => c.text)).toEqual(["B", "D"]);
    expect(toc[0].children[0].children.map((c) => c.id)).toEqual(["c"]);
  });

  it("handles skipped levels and multiple roots", () => {
    const toc = buildToc(md.parse("### x\n# y\n### z"));
    expect(toc.map((e) => e.text)).toEqual(["x", "y"]);
    expect(toc[1].children[0].text).toBe("z");
  });

  it("renders markdown", () => {
    const toc = buildToc(md.parse("# A [b]\n## C"));
    expect(renderTocMarkdown(toc)).toBe("- [A \\[b\\]](#a-b)\n  - [C](#c)\n");
  });
});
