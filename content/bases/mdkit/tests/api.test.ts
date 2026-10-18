import { describe, it, expect } from "testkit";
import { createProcessor, markdownToHtml, runCli } from "../src/index";
import type { CliIO } from "../src/index";

function fakeIO(files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIO = {
    readFile: (p) => files[p],
    stdout: (s) => void out.push(s),
    stderr: (s) => void err.push(s),
  };
  return { io, out, err };
}

const DOC = "---\ntitle: Guide\ntags: [a, b]\n---\n# Intro\n\nHello *there*.\n\n## Setup\n\n## Setup\n\n### Deep\n\n#### Deeper\n";

describe("createProcessor", () => {
  it("returns html, text, toc and front matter", () => {
    const res = createProcessor().process(DOC);
    expect(res.title).toBe("Guide");
    expect(res.frontMatter).toEqual({ title: "Guide", tags: ["a", "b"] });
    expect(res.html).toContain('<h2 id="setup-1">Setup</h2>');
    expect(res.text.startsWith("Intro\n\nHello there.")).toBe(true);
    expect(res.toc[0].children.map((e) => e.id)).toEqual(["setup", "setup-1"]);
    expect(res.tocHtml).toContain('<a href="#deep">Deep</a>');
    expect(res.tocHtml).not.toContain("deeper");
  });

  it("falls back to the first h1 for the title", () => {
    expect(createProcessor().process("text\n\n# Real *Title*").title).toBe("Real Title");
  });

  it("reports body line numbers relative to the original file", () => {
    const res = createProcessor().process(DOC);
    expect(res.ast.children[0].position).toEqual({ line: 5 });
  });

  it("can disable anchors and front matter", () => {
    const res = createProcessor({ anchors: false, frontMatter: false }).process("---\na: 1\n---\n# H");
    expect(res.html).toBe("<hr>\n<h2>a: 1</h2>\n<h1>H</h1>\n");
  });

  it("markdownToHtml is safe by default", () => {
    expect(markdownToHtml("<script>x</script>")).toBe("<p>&lt;script&gt;x&lt;/script&gt;</p>\n");
  });
});

describe("cli", () => {
  it("renders html and text", () => {
    const { io, out } = fakeIO({ "a.md": DOC });
    expect(runCli(["render", "a.md", "--no-anchors"], io)).toBe(0);
    expect(out.join("")).toContain("<h2>Setup</h2>");
    const t = fakeIO({ "a.md": DOC });
    expect(runCli(["render", "a.md", "--format", "text"], t.io)).toBe(0);
    expect(t.out.join("")).toContain("Hello there.");
  });

  it("prints a toc in several formats", () => {
    const md = fakeIO({ "a.md": DOC });
    expect(runCli(["toc", "a.md", "--max-depth=2"], md.io)).toBe(0);
    expect(md.out.join("")).toBe("- [Intro](#intro)\n  - [Setup](#setup)\n  - [Setup](#setup-1)\n");
    const js = fakeIO({ "a.md": DOC });
    runCli(["toc", "a.md", "--format", "json", "--min-depth", "3"], js.io);
    expect(JSON.parse(js.out.join(""))).toEqual([{ depth: 3, text: "Deep", id: "deep", children: [] }]);
  });

  it("prints front matter", () => {
    const { io, out } = fakeIO({ "a.md": DOC });
    runCli(["fm", "a.md"], io);
    expect(JSON.parse(out.join(""))).toEqual({ title: "Guide", tags: ["a", "b"] });
  });

  it("uses exit code 2 for usage errors and 1 for runtime errors", () => {
    const u = fakeIO({});
    expect(runCli(["render", "a.md", "--bogus"], u.io)).toBe(2);
    expect(u.err.join("")).toContain("unknown option --bogus");
    const r = fakeIO({});
    expect(runCli(["render", "missing.md"], r.io)).toBe(1);
    expect(r.err.join("")).toContain("cannot read missing.md");
    const fm = fakeIO({ "bad.md": "---\nnope\n---\n" });
    expect(runCli(["fm", "bad.md"], fm.io)).toBe(1);
  });
});
