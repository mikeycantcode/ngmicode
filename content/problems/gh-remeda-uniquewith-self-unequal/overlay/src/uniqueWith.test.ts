import { describe, expect, test } from "vitest";
import { createLazyInvocationCounter } from "../test/lazyInvocationCounter";
import { isDeepEqual } from "./isDeepEqual";
import { pipe } from "./pipe";
import { take } from "./take";
import { uniqueWith } from "./uniqueWith";

describe("data_first", () => {
  test("should return uniq", () => {
    expect(
      uniqueWith(
        [{ a: 1 }, { a: 2 }, { a: 2 }, { a: 5 }, { a: 1 }, { a: 6 }, { a: 7 }],
        isDeepEqual,
      ),
    ).toStrictEqual([{ a: 1 }, { a: 2 }, { a: 5 }, { a: 6 }, { a: 7 }]);
  });

  test("consecutive duplicates", () => {
    expect(uniqueWith([1, 1, 2, 2], (a, b) => a === b)).toStrictEqual([1, 2]);
  });

  test("returns a shallow clone when no items are equal", () => {
    const data = [1, 2, 3];
    const result = uniqueWith(data, (a, b) => a === b);

    expect(result).toStrictEqual(data);
    expect(result).not.toBe(data);
  });
});

describe("data_last", () => {
  test("should return uniq", () => {
    expect(
      uniqueWith(isDeepEqual)([
        { a: 1 },
        { a: 2 },
        { a: 2 },
        { a: 5 },
        { a: 1 },
        { a: 6 },
        { a: 7 },
      ]),
    ).toStrictEqual([{ a: 1 }, { a: 2 }, { a: 5 }, { a: 6 }, { a: 7 }]);
  });

  test("lazy", () => {
    const counter = createLazyInvocationCounter();
    const result = pipe(
      [{ a: 1 }, { a: 2 }, { a: 2 }, { a: 5 }, { a: 1 }, { a: 6 }, { a: 7 }],
      counter.fn(),
      uniqueWith(isDeepEqual),
      take(3),
    );

    expect(counter.count).toHaveBeenCalledTimes(4);
    expect(result).toStrictEqual([{ a: 1 }, { a: 2 }, { a: 5 }]);
  });

  // @see https://github.com/remeda/remeda/issues/14
  test("take before uniq (#14)", () => {
    const counter = createLazyInvocationCounter();
    const result = pipe(
      [{ a: 1 }, { a: 2 }, { a: 2 }, { a: 5 }, { a: 1 }, { a: 6 }, { a: 7 }],
      counter.fn(),
      take(3),
      uniqueWith(isDeepEqual),
    );

    expect(counter.count).toHaveBeenCalledTimes(3);
    expect(result).toStrictEqual([{ a: 1 }, { a: 2 }]);
  });
});
