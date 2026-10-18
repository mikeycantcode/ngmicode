import { it, expect } from "testkit";
import { inc } from "../../src/semver/inc";
import { SemverError } from "../../src/core/errors";

it("bumps major / minor / patch including prerelease promotion", () => {
  expect(inc("1.2.3", "major")).toBe("2.0.0");
  expect(inc("2.0.0-rc.1", "major")).toBe("2.0.0");
  expect(inc("2.1.0-rc.1", "major")).toBe("3.0.0");
  expect(inc("1.2.0-beta", "minor")).toBe("1.2.0");
  expect(inc("1.2.3-beta", "minor")).toBe("1.3.0");
  expect(inc("1.2.3-beta.4", "patch")).toBe("1.2.3");
  expect(inc("v1.2.3+build.7", "patch")).toBe("1.2.4");
});

it("bumps prereleases", () => {
  expect(inc("1.2.3", "prerelease")).toBe("1.2.4-0");
  expect(inc("1.2.3", "prerelease", "beta")).toBe("1.2.4-beta.0");
  expect(inc("1.2.3-beta.9", "prerelease")).toBe("1.2.3-beta.10");
  expect(inc("1.2.3-beta", "prerelease")).toBe("1.2.3-beta.0");
  expect(inc("1.0.0-beta.2.hotfix", "prerelease")).toBe("1.0.0-beta.3.hotfix");
  expect(inc("1.2.3-alpha.3", "prerelease", "beta")).toBe("1.2.3-beta.0");
  expect(inc("1.2.3-beta.2", "prerelease", "beta")).toBe("1.2.3-beta.3");
});

it("rejects bad input with exact messages", () => {
  expect(() => inc("1.2", "patch")).toThrow(SemverError);
  expect(() => inc("1.2", "patch")).toThrow('Invalid version: "1.2"');
  expect(() => inc("1.2.3", "huge" as any)).toThrow('Invalid release type: "huge"');
});
