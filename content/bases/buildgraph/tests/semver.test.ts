import { describe, it, expect } from "testkit";
import { format, parse, parsePartial } from "../src/semver/parse";
import { compare, sortVersions } from "../src/semver/compare";
import { Range, maxSatisfying, satisfies, validRange } from "../src/semver/range";

describe("parse", () => {
  it("parses full versions with prerelease and build", () => {
    const v = parse("v1.2.3-beta.11+sha.abc")!;
    expect(v).toEqual({ major: 1, minor: 2, patch: 3, prerelease: ["beta", 11], build: ["sha", "abc"] });
    expect(format(v)).toBe("1.2.3-beta.11");
  });
  it("rejects invalid versions", () => {
    for (const bad of ["1.2", "01.2.3", "1.2.3-", "1.2.3-01", "a.b.c", ""]) expect(parse(bad)).toBeNull();
  });
  it("parses partials", () => {
    expect(parsePartial("1.x")).toEqual({ major: 1, minor: null, patch: null, prerelease: [] });
    expect(parsePartial("*")!.major).toBeNull();
  });
});

describe("compare", () => {
  it("orders by precedence per SemVer §11", () => {
    const sorted = ["1.0.0", "1.0.0-rc.1", "1.0.0-beta.11", "1.0.0-beta.2", "1.0.0-beta", "1.0.0-alpha.beta", "1.0.0-alpha.1", "1.0.0-alpha"];
    expect(sortVersions(sorted)).toEqual([
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ]);
  });
  it("ignores build metadata", () => {
    expect(compare("1.0.0+a", "1.0.0+b")).toBe(0);
    expect(compare("2.0.0", "10.0.0")).toBe(-1);
  });
});

describe("Range", () => {
  it("desugars caret, tilde and x-ranges", () => {
    expect(new Range("^1.2.3").toString()).toBe(">=1.2.3 <2.0.0-0");
    expect(new Range("^0.2.3").toString()).toBe(">=0.2.3 <0.3.0-0");
    expect(new Range("^0.0.3").toString()).toBe(">=0.0.3 <0.0.4-0");
    expect(new Range("~1.2").toString()).toBe(">=1.2.0 <1.3.0-0");
    expect(new Range("1.x || >=2.5.0").toString()).toBe(">=1.0.0 <2.0.0-0 || >=2.5.0");
    expect(new Range("*").toString()).toBe("*");
    expect(new Range("<=1.2").toString()).toBe("<1.3.0-0");
  });
  it("tests versions", () => {
    expect(satisfies("1.9.9", "^1.2.3")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.3")).toBe(false);
    expect(satisfies("1.2.4", ">= 1.2.3 < 1.3")).toBe(true);
    expect(satisfies("3.1.0", "^1.0.0 || ^3.0.0")).toBe(true);
  });
  it("excludes prereleases unless the range opts in on the same tuple", () => {
    expect(satisfies("1.3.0-beta.1", "^1.2.3")).toBe(false);
    expect(satisfies("1.2.3-beta.4", "^1.2.3-beta.1")).toBe(true);
    expect(satisfies("1.3.0-beta.1", "^1.2.3-beta.1")).toBe(false);
    expect(satisfies("1.3.0-beta.1", "^1.2.3", { includePrerelease: true })).toBe(true);
  });
  it("maxSatisfying and validRange", () => {
    expect(maxSatisfying(["1.2.3", "1.4.0", "2.0.0", "1.5.0-rc.1"], "^1.0.0")).toBe("1.4.0");
    expect(maxSatisfying(["1.0.0"], "^2")).toBeNull();
    expect(validRange("not a range")).toBeNull();
    expect(() => new Range(">=1.2.3 <<2")).toThrow("Invalid range");
  });
});
