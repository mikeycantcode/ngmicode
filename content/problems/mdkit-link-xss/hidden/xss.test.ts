import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";

const md = new Mdkit();
const DANGEROUS_ATTR = /(?:href|src)="\s*(?:javascript|vbscript|data:text)/i;

it("blocks script URLs regardless of case, scheme or encoding", () => {
  const vectors = [
    "[a](JaVaScRiPt:alert(1))",
    "[a](&#74;avascript:alert(1))",
    "[a](vbscript:msgbox(1))",
    "[a](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "![x](JAVASCRIPT:alert(1))",
    "[a][r]\n\n[r]: Javascript:alert(1)",
  ];
  for (const v of vectors) expect(md.render(v)).not.toMatch(DANGEROUS_ATTR);
  // Safe URLs keep working.
  expect(md.render("[a](https://x.io) [b](/rel) [c](mailto:a@b.co)")).toBe(
    '<p><a href="https://x.io">a</a> <a href="/rel">b</a> <a href="mailto:a@b.co">c</a></p>\n',
  );
  expect(md.render("![p](data:image/png;base64,AAAA)")).toContain('src="data:image/png;base64,AAAA"');
});

it("vets autolinks too", () => {
  expect(md.render("<javascript:alert(1)>")).not.toMatch(DANGEROUS_ATTR);
  expect(md.render("<JAVASCRIPT:alert(1)>")).not.toMatch(DANGEROUS_ATTR);
  expect(md.render("<https://ok.io>")).toBe('<p><a href="https://ok.io">https://ok.io</a></p>\n');
});

it("never lets a quote break out of an attribute", () => {
  const title = md.render('[a](/x "t\\" onmouseover=\\"alert(1)")');
  expect(title).toContain('title="t&quot; onmouseover=&quot;alert(1)"');
  const alt = md.render('![a" onerror="alert(1)](/i.png)');
  expect(alt).toContain('alt="a&quot; onerror=&quot;alert(1)"');
  const code = md.render('```js" onclick="alert(1)\nx\n```');
  expect(code).toContain('class="language-js&quot;"');
  expect(code).not.toContain('" onclick="');
});

it("still escapes raw HTML when html is off", () => {
  const out = md.render('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[x](/a) <b onclick="y">z</b>');
  expect(out).not.toContain("<img");
  expect(out).not.toContain("<script");
  expect(out).not.toContain("<b ");
  expect(out).toContain("&lt;script&gt;");
});
