import { it, expect } from "testkit";
import { renderPreview, type PreviewContext } from "../../src/domain/preview";

const ctx: PreviewContext = {
  userName: (id) => ({ u_000001: "Mary_Jane", u_000002: "Bob *B*" } as Record<string, string>)[id],
  channelName: (id) => (id === "c_000007" ? "ops_team" : undefined),
};

it("strips markdown from text only, then substitutes tokens", () => {
  expect(renderPreview("*ship* it <@u_000001> in <#c_000007> `now` ~~old~~ <@u_000002>", ctx, 200)).toBe(
    "ship it @Mary_Jane in #ops_team now old @Bob *B*",
  );
  expect(renderPreview("<!here> ping <@u_000099> see <#c_000099>", ctx, 200)).toBe("@here ping @unknown see #unknown");
});

it("un-escapes exactly once and collapses whitespace", () => {
  expect(renderPreview("a &lt; b &amp;&amp; c &gt;\n\n  d &amp;lt;", ctx, 200)).toBe("a < b && c > d &lt;");
});

it("truncates on word boundaries with the exact rules", () => {
  // fits exactly
  expect(renderPreview("hello world", ctx, 11)).toBe("hello world");
  // budget 9: "hello wor" + next char "l" is mid-word; last space at 5 >= floor(9/2)=4 -> cut back
  expect(renderPreview("hello world", ctx, 10)).toBe("hello…");
  // next char after the cut is a space -> keep the full budget
  expect(renderPreview("hello world again", ctx, 12)).toBe("hello world…");
  // last space too early (index 1 < floor(9/2)) -> hard cut
  expect(renderPreview("a supercalifragilistic", ctx, 10)).toBe("a superca…");
  const out = renderPreview("x".repeat(50), ctx, 20);
  expect(out).toBe("x".repeat(19) + "…");
});

it("never splits a surrogate pair and validates maxLen", () => {
  expect(renderPreview("abc🚀def", ctx, 5)).toBe("abc…");
  expect(() => renderPreview("hi", ctx, 1)).toThrow(RangeError);
  expect(() => renderPreview("hi", ctx, 2.5)).toThrow("maxLen must be an integer >= 2");
});
