import { describe, expect, test } from "vitest";
import { withoutBase } from "../../src";

// From unjs/ufo#335 — collapse leading "//" to prevent protocol-relative URL injection
describe("withoutBase (protocol-relative injection)", () => {
  const tests = [
    { base: "/legacy", input: "/legacy//evil.com", out: "/evil.com" },
    { base: "/legacy/", input: "/legacy//evil.com", out: "/evil.com" },
    { base: "/legacy", input: "/legacy///evil.com", out: "/evil.com" },
    { base: "/legacy", input: "/legacy//", out: "/" },
  ];

  test("never returns a protocol-relative URL", () => {
    for (const t of tests) {
      expect(withoutBase(t.input, t.base)).toBe(t.out);
    }
  });
});
