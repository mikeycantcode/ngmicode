import { describe, it, expect } from "testkit";
import { HtmlRenderer, Mdkit, renderHtml, renderText } from "../src/index";
import type { Plugin } from "../src/index";

describe("html renderer", () => {
  it("escapes text", () => {
    expect(new Mdkit().render('a < b & "c" [x](/y "say hi")')).toBe(
      '<p>a &lt; b &amp; "c" <a href="/y" title="say hi">x</a></p>\n',
    );
  });

  it("supports xhtml output", () => {
    expect(new Mdkit({ xhtml: true }).render("a  \nb\n\n---\n\n![i](/i.png)")).toBe(
      '<p>a<br />\nb</p>\n<hr />\n<p><img src="/i.png" alt="i" /></p>\n',
    );
  });

  it("can render soft breaks as <br>", () => {
    expect(new Mdkit({ breaks: true }).render("a\nb")).toBe("<p>a<br>\nb</p>\n");
  });

  it("uses langPrefix for code classes", () => {
    expect(new Mdkit({ langPrefix: "lang-" }).render("```py\nx\n```")).toBe('<pre><code class="lang-py">x\n</code></pre>\n');
  });

  it("renders tables", () => {
    expect(new Mdkit().render("a | b\n:-:|--\n1 | 2")).toBe(
      '<table>\n<thead>\n<tr>\n<th style="text-align:center">a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td style="text-align:center">1</td>\n<td>2</td>\n</tr>\n</tbody>\n</table>\n',
    );
  });

  it("lets plugins override rendering per node type", () => {
    const upper: Plugin = {
      name: "upper",
      hooks: { render: { inlineCode: (n) => `<kbd>${(n as { value: string }).value.toUpperCase()}</kbd>` } },
    };
    expect(new Mdkit().use(upper).render("`ctrl`")).toBe("<p><kbd>CTRL</kbd></p>\n");
  });

  it("keeps the positional renderHtml signature working", () => {
    const md = new Mdkit();
    const ast = md.parse("a\nb");
    expect(renderHtml(ast, true, false, true)).toBe("<p>a<br>\nb</p>\n");
    expect(new HtmlRenderer().render(ast)).toBe("<p>a\nb</p>\n");
  });
});

describe("sanitizing", () => {
  const md = new Mdkit();

  it("drops javascript: links but keeps their text", () => {
    expect(md.render("[click](javascript:alert(1))")).toBe("<p>click</p>\n");
  });

  it("drops unsafe image sources", () => {
    expect(md.render("![x](javascript:alert(1))")).toBe("<p>x</p>\n");
  });

  it("allows data: images", () => {
    expect(md.render("![x](data:image/png;base64,AAAA)")).toContain('src="data:image/png;base64,AAAA"');
  });

  it("can be turned off", () => {
    expect(new Mdkit({ sanitize: false }).render("[a](javascript:void(0))")).toContain('href="javascript:void(0)"');
  });
});

describe("text renderer", () => {
  const md = new Mdkit();

  it("flattens formatting", () => {
    expect(renderText(md.parse("# Title\n\nSome *em* and [a link](/x).\n\n> quoted"))).toBe(
      "Title\n\nSome em and a link.\n\n> quoted\n",
    );
  });

  it("renders lists and code", () => {
    expect(renderText(md.parse("1. one\n2. two\n   - nested\n\n```\ncode\n```"))).toBe(
      "1. one\n2. two\n   - nested\n\ncode\n",
    );
  });

  it("can include link urls", () => {
    expect(renderText(md.parse("[a](/x) <http://y.z>"), { linkUrls: true })).toBe("a (/x) http://y.z\n");
  });

  it("throws on unknown node types", () => {
    const ast = md.parse("x");
    (ast.children as unknown[]).push({ type: "mystery" });
    expect(() => renderText(ast)).toThrow(/unknown block node type "mystery"/);
  });
});
