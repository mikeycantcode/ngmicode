import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";
import { HtmlRenderer, renderHtml } from "../../src/render/html";
import type { Plugin } from "../../src/plugins/pluginHost";

const md = new Mdkit();
const DOC = "a  \nb\nc\n\n[x](javascript:alert(1)) ![i](/i.png)\n\n```js\nx\n```";
const ast = md.parse(DOC);

it("accepts an options object and keeps safe defaults for anything omitted", () => {
  for (const out of [renderHtml(ast), renderHtml(ast, {}), renderHtml(ast, { xhtml: true })]) {
    expect(out).not.toContain("javascript:");
  }
  expect(renderHtml(ast, { xhtml: true })).toBe(
    '<p>a<br />\nb\nc</p>\n<p>x <img src="/i.png" alt="i" /></p>\n<pre><code class="language-js">x\n</code></pre>\n',
  );
  expect(renderHtml(ast, { sanitize: false, breaks: true, langPrefix: "lang-" })).toBe(
    '<p>a<br>\nb<br>\nc</p>\n<p><a href="javascript:alert(1)">x</a> <img src="/i.png" alt="i"></p>\n<pre><code class="lang-js">x\n</code></pre>\n',
  );
});

it("still supports the deprecated positional form with identical output", () => {
  expect(renderHtml(ast, false)).toBe(renderHtml(ast, { sanitize: false }));
  expect(renderHtml(ast, undefined, true)).toBe(renderHtml(ast, { xhtml: true }));
  expect(renderHtml(ast, true, false, false, "x-")).toBe(renderHtml(ast, { langPrefix: "x-" }));
});

it("HtmlRenderer takes the same options object", () => {
  expect(new HtmlRenderer({ xhtml: true }).render(md.parse("---"))).toBe("<hr />\n");
  expect(new HtmlRenderer({}).render(ast)).toBe(renderHtml(ast));
  expect(new HtmlRenderer({ sanitize: false }).render(md.parse("[x](javascript:y)"))).toContain('href="javascript:y"');
});

it("instance options and plugin overrides still flow through Mdkit", () => {
  const kbd: Plugin = { name: "kbd", hooks: { render: { inlineCode: (n) => `<kbd>${(n as { value: string }).value}</kbd>` } } };
  const m = new Mdkit({ xhtml: true, breaks: true, sanitize: false }).use(kbd);
  expect(m.render("`k`\nx\n\n[a](javascript:b)")).toBe('<p><kbd>k</kbd><br />\nx</p>\n<p><a href="javascript:b">a</a></p>\n');
});
