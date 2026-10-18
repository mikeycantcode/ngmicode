import { it, expect } from "testkit";
import { createProcessor } from "../../src/api/processor";
import { runCli } from "../../src/api/cli";

const DOC = [
  "---",
  "title: Guide",
  "toc_depth: 2",
  "---",
  "# Guide",
  "",
  "[[toc]]",
  "",
  "## Setup",
  "### Linux",
  "## Setup",
  "",
  "```md",
  "[[toc]]",
  "```",
  "",
  "Inline `[[toc]]` and text [[toc]] stay.",
].join("\n");

function cli(argv: string[], files: Record<string, string>) {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(argv, { readFile: (p) => files[p], stdout: (s) => void out.push(s), stderr: (s) => void err.push(s) });
  return { code, out: out.join(""), err: err.join("") };
}

it("replaces the marker with a nav whose links match the heading ids, limited by front matter", () => {
  const res = createProcessor().process(DOC);
  expect(res.html).toContain(
    '<nav class="toc">\n<ul>\n<li><a href="#guide">Guide</a>\n<ul>\n<li><a href="#setup">Setup</a></li>\n<li><a href="#setup-1">Setup</a></li>\n</ul>\n</li>\n</ul>\n</nav>\n',
  );
  expect(res.html).toContain('<h2 id="setup-1">Setup</h2>');
  expect(res.html).not.toContain('href="#linux"');
  expect(res.toc[0].children.map((e) => e.id)).toEqual(["setup", "setup-1"]);
  expect(res.toc[0].children[0].children).toEqual([]);
});

it("leaves code and inline markers alone, honors toc: false, and front matter beats processor options", () => {
  const res = createProcessor({ toc: { maxDepth: 6 } }).process(DOC);
  expect(res.html).toContain("<pre><code class=\"language-md\">[[toc]]\n</code></pre>");
  expect(res.html).toContain("<p>Inline <code>[[toc]]</code> and text [[toc]] stay.</p>");
  expect(res.html).not.toContain('href="#linux"');
  const off = createProcessor().process(DOC.replace("toc_depth: 2", "toc: false"));
  expect(off.html).not.toContain("<nav");
  expect(off.html).not.toContain("<p>[[toc]]</p>");
  const noFm = createProcessor({ toc: { maxDepth: 3 } }).process("# A\n\n[[TOC]]\n\n### C");
  expect(noFm.html).toContain('<li><a href="#c">C</a></li>');
});

it("lets the CLI flag override front matter, and text output works", () => {
  const files = { "g.md": DOC };
  const html = cli(["render", "g.md", "--toc-depth", "3"], files);
  expect(html.code).toBe(0);
  expect(html.out).toContain('<li><a href="#linux">Linux</a></li>');
  const text = cli(["render", "g.md", "--format", "text"], files);
  expect(text.code).toBe(0);
  expect(text.out).toContain("Guide\n\nSetup");
  expect(text.out).toContain("Inline [[toc]] and text [[toc]] stay.");
});

it("rejects an invalid toc_depth", () => {
  const r = cli(["render", "bad.md"], { "bad.md": "---\ntoc_depth: deep\n---\n[[toc]]" });
  expect(r.code).toBe(1);
  expect(r.err).toContain("toc_depth");
  const u = cli(["render", "g.md", "--toc-depth", "9"], { "g.md": DOC });
  expect(u.code).toBe(2);
});
