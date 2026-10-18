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
    expect(parseYamlLite(["# header", "a: 1 # one"])).toEqual({ a: 1 });
  });

  it("reports the line of an error", () => {
    expect(() => parseYamlLite(["a: 1", "oops"], 2)).toThrow(/line 3/);
    expect(() => parseYamlLite(["a: {b: 1}"])).toThrow(FrontMatterError);
  });
});
