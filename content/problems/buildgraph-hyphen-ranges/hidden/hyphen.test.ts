import { it, expect } from "testkit";
import { Range, satisfies } from "../../src/semver/range";
import { SemverError } from "../../src/core/errors";

it("desugars hyphen ranges exactly", () => {
  const cases: [string, string][] = [
    ["1.2.3 - 2.3.4", ">=1.2.3 <=2.3.4"],
    ["1.2 - 2.3.4", ">=1.2.0 <=2.3.4"],
    ["1.2.3 - 2.3", ">=1.2.3 <2.4.0-0"],
    ["1.2.3 - 2", ">=1.2.3 <3.0.0-0"],
    ["* - 2.0.0", "<=2.0.0"],
    ["1.0.0 - *", ">=1.0.0"],
    ["* - *", "*"],
    ["1 - 2 || ^5.0.0", ">=1.0.0 <3.0.0-0 || >=5.0.0 <6.0.0-0"],
    ["1.2.3-rc.1 - 2.0.0", ">=1.2.3-rc.1 <=2.0.0"],
  ];
  for (const [input, expected] of cases) expect(new Range(input).toString()).toBe(expected);
});

it("tests versions against hyphen bounds", () => {
  expect(satisfies("2.3.9", "1.2.3 - 2.3")).toBe(true);
  expect(satisfies("2.4.0", "1.2.3 - 2.3")).toBe(false);
  expect(satisfies("2.3.4", "1.2.3 - 2.3.4")).toBe(true);
  expect(satisfies("1.2.2", "1.2.3 - 2.3.4")).toBe(false);
  expect(satisfies("1.2.3-rc.2", "1.2.3-rc.1 - 2.0.0")).toBe(true);
  expect(satisfies("1.5.0-beta.1", "1.2.3-rc.1 - 2.0.0")).toBe(false);
});

it("keeps unspaced hyphens as prereleases and rejects malformed hyphens", () => {
  expect(new Range("1.2.3-2.3.4").toString()).toBe("1.2.3-2.3.4");
  for (const bad of ["1 - 2 - 3", "- 2", "1.2.3 -", ">=1 - 2", "1 - 2 <3"]) {
    expect(() => new Range(bad)).toThrow(SemverError);
    expect(() => new Range(bad)).toThrow("Invalid range");
  }
});
