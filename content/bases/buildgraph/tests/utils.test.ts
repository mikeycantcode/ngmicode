import { describe, it, expect } from "testkit";
import { hashObject, hashString } from "../src/utils/hash";
import { matchAny, matchGlob } from "../src/utils/glob";
import { isWithin, join, normalize, relative } from "../src/utils/paths";
import { MemoryFS, TrackedFS } from "../src/vfs/vfs";

describe("hash", () => {
  it("is deterministic and key-order independent", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
    expect(hashString("hello")).toHaveLength(16);
    expect(hashString("hello")).not.toBe(hashString("hellp"));
    expect(hashObject({ a: 1, b: [1, 2] })).toBe(hashObject({ b: [1, 2], a: 1 }));
  });
});

describe("glob", () => {
  it("matches common patterns", () => {
    expect(matchGlob("dist/**", "dist/a/b.js")).toBe(true);
    expect(matchGlob("src/*.ts", "src/a/b.ts")).toBe(false);
    expect(matchGlob("**/*.{ts,tsx}", "x/y.tsx")).toBe(true);
    expect(matchGlob("packages/*", "packages/ui")).toBe(true);
    expect(matchAny(["src/**", "!src/**/*.test.ts"], "src/a.test.ts")).toBe(false);
  });
});

describe("paths", () => {
  it("normalizes and relates paths", () => {
    expect(normalize("a/./b/../c//d/")).toBe("a/c/d");
    expect(normalize("../a")).toBe("../a");
    expect(join("packages/ui", "dist/../x.js")).toBe("packages/ui/x.js");
    expect(relative("packages/ui", "packages/ui/dist/a.js")).toBe("dist/a.js");
    expect(isWithin("packages/ui", "packages/ui-kit/a")).toBe(false);
    expect(isWithin("packages/ui", "packages/ui/a")).toBe(true);
  });
});

describe("MemoryFS", () => {
  it("reads, writes, lists and globs", () => {
    const fs = new MemoryFS({ "b/x.ts": "1", "a/y.ts": "2", "a/z/w.js": "3" });
    expect(fs.list()).toEqual(["a/y.ts", "a/z/w.js", "b/x.ts"]);
    expect(fs.list("a")).toEqual(["a/y.ts", "a/z/w.js"]);
    expect(fs.glob("**/*.ts", "a")).toEqual(["a/y.ts"]);
    expect(fs.isDirectory("a/z")).toBe(true);
    expect(() => fs.read("nope")).toThrow("ENOENT");
    expect(() => fs.write("../outside", "x")).toThrow("escapes workspace root");
  });
  it("TrackedFS records changes since mark", () => {
    const fs = new TrackedFS(new MemoryFS({ "a.txt": "1" }));
    fs.write("a.txt", "1");
    fs.write("b.txt", "2");
    expect(fs.changedSinceMark()).toEqual(["b.txt"]);
    fs.mark();
    fs.delete("a.txt");
    expect(fs.changedSinceMark()).toEqual(["a.txt"]);
  });
});
