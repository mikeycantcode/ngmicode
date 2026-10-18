import { describe, it, expect } from "testkit";
import { createEnv, DEFAULT_PARSE_OPTIONS, Mdkit, parseInline } from "../src/index";

const md = new Mdkit();
const inline = (src: string) => {
  const out = md.render(src);
  return out.replace(/^<p>/, "").replace(/<\/p>\n$/, "");
};

describe("emphasis", () => {
  it("handles * and _", () => {
    expect(inline("*a* _b_ **c** __d__")).toBe("<em>a</em> <em>b</em> <strong>c</strong> <strong>d</strong>");
  });

  it("nests", () => {
    expect(inline("*a **b** c*")).toBe("<em>a <strong>b</strong> c</em>");
    expect(inline("***x***")).toBe("<em><strong>x</strong></em>");
  });

  it("ignores intraword underscores", () => {
    expect(inline("snake_case_name")).toBe("snake_case_name");
    expect(inline("2*3*4")).toBe("2<em>3</em>4");
  });

  it("leaves unmatched delimiters as text", () => {
    expect(inline("*a **b")).toBe("*a **b");
    expect(inline("a * b * c")).toBe("a * b * c");
  });
});

describe("code spans", () => {
  it("matches backtick runs of equal length", () => {
    expect(inline("``a ` b``")).toBe("<code>a ` b</code>");
    expect(inline("` `` `")).toBe("<code>``</code>");
  });

  it("leaves unmatched backticks literal and does not parse inside", () => {
    expect(inline("`*a*")).toBe("`<em>a</em>");
    expect(inline("`*a*`")).toBe("<code>*a*</code>");
  });
});

describe("links and images", () => {
  it("parses inline links with titles", () => {
    expect(inline('[a](/b "c")')).toBe('<a href="/b" title="c">a</a>');
    expect(inline("[a](</my url>)")).toBe('<a href="/my%20url">a</a>');
    expect(inline("[a](/p(1))")).toBe('<a href="/p(1)">a</a>');
  });

  it("supports emphasis inside link text but not links inside links", () => {
    expect(inline("[*a*](/x)")).toBe('<a href="/x"><em>a</em></a>');
    expect(inline("[a [b](/inner)](/outer)")).toBe('[a <a href="/inner">b</a>](/outer)');
  });

  it("resolves reference links", () => {
    expect(inline("[x][Ref] [ref][] [ref]\n\n[ref]: /r")).toBe('<a href="/r">x</a> <a href="/r">ref</a> <a href="/r">ref</a>');
  });

  it("keeps unresolved brackets as text", () => {
    expect(inline("[nope] [a](")).toBe("[nope] [a](");
  });

  it("renders images with plain-text alt", () => {
    expect(inline('![a *b*](/i.png "t")')).toBe('<img src="/i.png" alt="a b" title="t">');
  });

  it("parses autolinks", () => {
    expect(inline("<https://x.io/a?b=1&c=2>")).toBe('<a href="https://x.io/a?b=1&amp;c=2">https://x.io/a?b=1&amp;c=2</a>');
    expect(inline("<me@example.com>")).toBe('<a href="mailto:me@example.com">me@example.com</a>');
  });
});

describe("escapes, entities and breaks", () => {
  it("handles backslash escapes", () => {
    expect(inline("\\*not\\* \\a")).toBe("*not* \\a");
  });

  it("decodes entities and escapes the result", () => {
    expect(inline("&copy; &amp; &#60; &#x3E; &bogus;")).toBe("© &amp; &lt; &gt; &amp;bogus;");
  });

  it("distinguishes soft and hard breaks", () => {
    expect(inline("a\nb  \nc\\\nd")).toBe("a\nb<br>\nc<br>\nd");
  });

  it("exposes the inline parser directly", () => {
    const nodes = parseInline("a *b*", DEFAULT_PARSE_OPTIONS, createEnv());
    expect(nodes).toEqual([{ type: "text", value: "a " }, { type: "emphasis", children: [{ type: "text", value: "b" }] }]);
  });
});
