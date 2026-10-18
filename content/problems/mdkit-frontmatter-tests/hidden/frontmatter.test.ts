import { it, expect } from "testkit";
import { extractFrontMatter } from "../../src/frontmatter/frontmatter";

it("keeps colons that are part of the value", () => {
  const fm = extractFrontMatter("---\nurl: https://example.com:8080/a\ntime: 12:30\ntitle: Part 2: The Return\n---\nbody");
  expect(fm.data).toEqual({ url: "https://example.com:8080/a", time: "12:30", title: "Part 2: The Return" });
});

it("only treats # as a comment outside quotes and after whitespace", () => {
  const fm = extractFrontMatter(
    ['---', 'title: "C# # tips"', "tag: 'a #b'", "slug: c#-intro", "n: 3 # three", "# full-line comment", "---", ""].join("\n"),
  );
  expect(fm.data).toEqual({ title: "C# # tips", tag: "a #b", slug: "c#-intro", n: 3 });
});
