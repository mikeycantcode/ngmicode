import { describe, expect, test } from "vitest";
import { isDeepEqual } from "../../src/isDeepEqual";
import { pipe } from "../../src/pipe";

// From remeda/remeda#1313 (issue #1228).
describe("null-prototype objects", () => {
  test("are equal to equivalent plain objects", () => {
    const data = { a: 1, b: "2" };
    const nullProtoObject = withNullPrototype(data);

    expect(isDeepEqual(nullProtoObject, data)).toBe(true);
    expect(isDeepEqual(data, nullProtoObject)).toBe(true);
  });

  test("are compared recursively", () => {
    const nullProtoObject = withNullPrototype({
      nested: withNullPrototype({ a: 1 }),
    });

    expect(isDeepEqual(nullProtoObject, { nested: { a: 1 } })).toBe(true);
  });

  test("compare property values against plain objects", () => {
    const data = { a: 1 };
    const nullProtoObject = withNullPrototype({ a: 2 });

    expect(isDeepEqual(data, nullProtoObject)).toBe(false);
    expect(isDeepEqual(nullProtoObject, data)).toBe(false);
  });

  test("work in data-last form", () => {
    const data = { a: 1 };
    const nullProtoObject = withNullPrototype(data);

    expect(pipe(data, isDeepEqual(nullProtoObject))).toBe(true);
  });

  test("objects with different non-null prototypes are not equal", () => {
    class TestObject {
      public readonly a = 1;
    }

    expect(isDeepEqual(new TestObject(), { a: 1 })).toBe(false);
  });
});

function withNullPrototype<T extends object>(data: T): T {
  return Object.assign(Object.create(null), data);
}
