import { describe, it, expect } from "testkit";
import { externalLinks, headingAnchors, Mdkit, PluginError, taskLists } from "../src/index";
import type { Plugin } from "../src/index";

describe("plugin host", () => {
  it("runs hooks in registration order", () => {
    const calls: string[] = [];
    const p = (name: string): Plugin => ({
      name,
      hooks: {
        preprocess: (s) => (calls.push(`${name}:pre`), s),
        afterBlocks: () => void calls.push(`${name}:blocks`),
        afterInlines: () => void calls.push(`${name}:inlines`),
      },
    });
    new Mdkit().use(p("a")).use(p("b")).parse("x");
    expect(calls).toEqual(["a:pre", "b:pre", "a:blocks", "b:blocks", "a:inlines", "b:inlines"]);
  });

  it("rejects duplicate plugin names", () => {
    const p: Plugin = { name: "dup", hooks: {} };
    expect(() => new Mdkit().use(p).use(p)).toThrow(PluginError);
  });

  it("wraps hook failures with the plugin name", () => {
    const bad: Plugin = { name: "bad", hooks: { afterInlines: () => { throw new Error("boom"); } } };
    expect(() => new Mdkit().use(bad).parse("x")).toThrow("[bad] afterInlines failed: boom");
  });

  it("chains render overrides, newest first", () => {
    const a: Plugin = { name: "a", hooks: { render: { text: () => "A" } } };
    const b: Plugin = { name: "b", hooks: { render: { text: (n) => ((n as { value: string }).value === "skip" ? undefined : "B") } } };
    const md = new Mdkit().use(a).use(b);
    expect(md.render("x")).toBe("<p>B</p>\n");
    expect(md.render("skip")).toBe("<p>A</p>\n");
  });

  it("lets preprocess rewrite source", () => {
    const shout: Plugin = { name: "shout", hooks: { preprocess: (s) => s.toUpperCase() } };
    expect(new Mdkit().use(shout).render("hi")).toBe("<p>HI</p>\n");
  });
});

describe("built-in plugins", () => {
  it("headingAnchors adds ids and optional permalinks", () => {
    expect(new Mdkit().use(headingAnchors()).render("# Hi\n# Hi")).toBe('<h1 id="hi">Hi</h1>\n<h1 id="hi-1">Hi</h1>\n');
    expect(new Mdkit().use(headingAnchors({ permalink: true, maxDepth: 2 })).render("## A\n### B")).toBe(
      '<h2 id="a">A <a class="anchor" href="#a">#</a></h2>\n<h3>B</h3>\n',
    );
  });

  it("taskLists marks checkboxes", () => {
    expect(new Mdkit().use(taskLists()).render("- [x] done\n- [ ] todo\n- [y] nope")).toBe(
      '<ul>\n<li><input type="checkbox" disabled checked> done</li>\n<li><input type="checkbox" disabled> todo</li>\n<li>[y] nope</li>\n</ul>\n',
    );
  });

  it("externalLinks only touches other hosts", () => {
    const out = new Mdkit().use(externalLinks({ siteHost: "docs.example.com" })).render(
      "[in](https://docs.example.com/a) [out](https://other.io) [rel](/x)",
    );
    expect(out).toBe(
      '<p><a href="https://docs.example.com/a">in</a> <a href="https://other.io" rel="noopener noreferrer" target="_blank">out</a> <a href="/x">rel</a></p>\n',
    );
  });
});
