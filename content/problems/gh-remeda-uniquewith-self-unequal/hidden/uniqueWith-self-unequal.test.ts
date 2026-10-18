import { describe, expect, test } from "vitest";
import { pipe } from "../../src/pipe";
import { uniqueWith } from "../../src/uniqueWith";

// From remeda/remeda#1001 (issue #999), plus upstream's follow-up tests for the
// same rule.
describe("data_first", () => {
  test("compares with every earlier item, not just the kept ones", () => {
    expect(
      // `3` is equal only to `2`, which is dropped for being equal to `1`.
      uniqueWith([1, 2, 3], (a, b) => Math.abs(a - b) === 1),
    ).toStrictEqual([1]);
  });

  test("should return items that are not equal to themselves (#999)", () => {
    expect(
      uniqueWith(
        [
          { id: 1, reason: "No name" },
          { id: 1, reason: "No name" },
          { reason: "No name" },
          { reason: "No name" },
        ] satisfies { id?: number; reason: string }[],
        (errorA, errorB) => {
          // the objects with no ids should effectively be ignored from removal of duplicates
          if (errorA.id === undefined || errorB.id === undefined) {
            return false;
          }
          return errorA.id === errorB.id;
        },
      ),
    ).toStrictEqual([
      { id: 1, reason: "No name" },
      { reason: "No name" },
      { reason: "No name" },
    ]);
  });
});

describe("data_last", () => {
  test("compares with every earlier item, not just the kept ones", () => {
    expect(
      pipe(
        // `3` is equal only to `2`, which is dropped for being equal to `1`.
        [1, 2, 3],
        uniqueWith((a, b) => Math.abs(a - b) === 1),
      ),
    ).toStrictEqual([1]);
  });

  test("should return items that are not equal to themselves (#999)", () => {
    expect(
      pipe(
        [
          { id: 1, reason: "No name" },
          { id: 1, reason: "No name" },
          { reason: "No name" },
          { reason: "No name" },
        ] as { id?: number; reason: string }[],
        uniqueWith((errorA, errorB) => {
          // the objects with no ids should effectively be ignored from removal of duplicates
          if (errorA.id === undefined || errorB.id === undefined) {
            return false;
          }
          return errorA.id === errorB.id;
        }),
      ),
    ).toStrictEqual([
      { id: 1, reason: "No name" },
      { reason: "No name" },
      { reason: "No name" },
    ]);
  });
});
