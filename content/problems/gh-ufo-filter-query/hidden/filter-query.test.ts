import { describe, expect, test } from "vitest";
import { filterQuery } from "../../src";

// From unjs/ufo#287
describe("filterQuery", () => {
  const predicate = (key: string) => key !== "bar";

  test("/foo filter \"bar\" (no query is returned untouched)", () => {
    expect(filterQuery("/foo", predicate)).toBe("/foo");
  });

  test("/foo?bar=1 filter \"bar\" (empty query drops the '?')", () => {
    expect(filterQuery("/foo?bar=1", predicate)).toBe("/foo");
  });

  test("/foo?bar=1&baz=2 filter \"bar\"", () => {
    expect(filterQuery("/foo?bar=1&baz=2", predicate)).toBe("/foo?baz=2");
  });
});
