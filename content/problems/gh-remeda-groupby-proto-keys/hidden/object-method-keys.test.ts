import { expect, test } from "vitest";
import { countBy } from "../../src/countBy";
import { groupBy } from "../../src/groupBy";
import { prop } from "../../src/prop";

// From remeda/remeda#1049 (issue #1046).
test("groupBy: key is an object instance method name", () => {
  expect(
    groupBy(
      [
        { a: "toString", b: "toString" },
        { a: "toString", b: "valueOf" },
        { a: "valueOf", b: "toString" },
        { a: "toString", b: "__proto__" },
      ],
      prop("a"),
    ),
  ).toStrictEqual({
    toString: [
      { a: "toString", b: "toString" },
      { a: "toString", b: "valueOf" },
      { a: "toString", b: "__proto__" },
    ],
    valueOf: [{ a: "valueOf", b: "toString" }],
  });
});

test("countBy: category is an object instance method name", () => {
  expect(
    countBy(
      [
        { a: "toString", b: "toString" },
        { a: "toString", b: "valueOf" },
        { a: "valueOf", b: "toString" },
        { a: "toString", b: "__proto__" },
      ],
      prop("a"),
    ),
  ).toStrictEqual({ toString: 3, valueOf: 1 });
});
