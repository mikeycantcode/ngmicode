import { describe, expect, test } from "vitest";
import { hasProtocol, isScriptProtocol, normalizeURL, parseURL } from "../../src";

// From unjs/ufo#170 — ignore leading whitespace / NUL bytes when detecting protocols
describe("leading whitespace and NUL bytes", () => {
  test("parseURL recognizes javascript: URLs, with or without a leading NUL", () => {
    const expected = {
      protocol: "javascript:",
      auth: "",
      host: "",
      href: "javascript:alert('hello')",
      pathname: "alert('hello')",
      search: "",
      hash: "",
    };
    expect(structuredClone(parseURL("javascript:alert('hello')"))).toEqual(expected);
    expect(structuredClone(parseURL("\0javascript:alert('hello')"))).toEqual(expected);
    expect(isScriptProtocol(parseURL("\0javascript:alert('hello')").protocol)).toBe(true);
  });

  test("parseURL ignores a leading NUL before an http(s) URL", () => {
    expect(structuredClone(parseURL("\0https://invalid.com"))).toEqual({
      protocol: "https:",
      auth: "",
      host: "invalid.com",
      pathname: "",
      search: "",
      hash: "",
    });
    expect(normalizeURL("\0http://google.com")).toBe("http://google.com");
  });

  test("hasProtocol sees through leading whitespace and NUL", () => {
    const cases: [string, boolean[]][] = [
      ["javascript:alert(true)", [true, false, true]],
      [" javascript:alert(true)", [true, false, true]],
      ["\0javascript:alert(true)", [true, false, true]],
      ["\0https://", [true, true, true]],
    ];
    for (const [input, [withDefault, withStrict, withAcceptRelative]] of cases) {
      expect(hasProtocol(input)).toBe(withDefault);
      expect(hasProtocol(input, { strict: true })).toBe(withStrict);
      expect(hasProtocol(input, { acceptRelative: true })).toBe(withAcceptRelative);
    }
  });

  test("isScriptProtocol ignores a leading NUL", () => {
    expect(isScriptProtocol("\0vbscript:")).toBe(true);
  });
});
