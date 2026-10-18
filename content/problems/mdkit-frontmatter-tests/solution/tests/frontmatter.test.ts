import { describe, it, expect } from "testkit";
import { extractFrontMatter, FrontMatterError, parseYamlLite } from "../src/index";

describe("extractFrontMatter", () => {
  it("splits data and body", () => {
    const fm = extractFrontMatter("---\ntitle: Hello\ndraft: false\n---\n# Body\n");
    expect(fm.data).toEqual({ title: "Hello", draft: false });
    expect(fm.body).toBe("# Body\n");
    expect(fm.lineCount).toBe(4);
  });

  it("returns the whole document when there is no front matter", () => {
    expect(extractFrontMatter("# Hi").body).toBe("# Hi");
    expect(extractFrontMatter("---\nnot closed").data).toEqual({});
  });

  it("handles CRLF line endings", () => {
    const fm = extractFrontMatter("---\r\ntitle: Win\r\n---\r\nbody");
    expect(fm.data).toEqual({ title: "Win" });
    expect(fm.body).toBe("body");
  });

  it("accepts ... as the closing fence", () => {
    expect(extractFrontMatter("---\na: 1\n...\nbody").body).toBe("body");
  });
});

describe("parseYamlLite", () => {
  it("parses scalars", () => {
    expect(parseYamlLite(["n: 42", "f: -1.5", "t: true", "z: ~", "s: plain text", "q: 'it''s'"])).toEqual({
      n: 42,
      f: -1.5,
      t: true,
      z: null,
      s: "plain text",
      q: "it's",
    });
  });

  it("parses inline and block lists", () => {
    expect(parseYamlLite(["tags: [a, \"b, c\", 3]", "authors:", "  - ann", "  - bob"])).toEqual({
      tags: ["a", "b, c", 3],
      authors: ["ann", "bob"],
    });
  });

  it("strips comments", () => {
    expect(parseYamlLite(["# header", "a: 1 # one", "  # indented comment"])).toEqual({ a: 1 });
  });

  it("keeps everything after the first colon in the value", () => {
    expect(parseYamlLite(["url: https://example.com:8080/a", "time: 12:30", "note: a: b"])).toEqual({
      url: "https://example.com:8080/a",
      time: "12:30",
      note: "a: b",
    });
  });

  it("does not treat # inside quotes or words as a comment", () => {
    expect(parseYamlLite(['title: "C# # tips"', "tag: 'a #b'", "slug: c#-intro", "color: x#1 # real comment"])).toEqual({
      title: "C# # tips",
      tag: "a #b",
      slug: "c#-intro",
      color: "x#1",
    });
  });

  it("keeps quoted values as strings", () => {
    expect(parseYamlLite(['version: "1.10"', "flag: 'true'", 'empty: ""'])).toEqual({ version: "1.10", flag: "true", empty: "" });
  });

  it("rejects keys without a space after the colon", () => {
    expect(() => parseYamlLite(["a:b"])).toThrow(FrontMatterError);
  });

  it("reports the line of an error", () => {
    expect(() => parseYamlLite(["a: 1", "oops"], 2)).toThrow(/line 3/);
    expect(() => parseYamlLite(["a: {b: 1}"])).toThrow(FrontMatterError);
  });
});
