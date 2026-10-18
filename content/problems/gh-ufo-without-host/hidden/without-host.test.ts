import { describe, expect, test } from "vitest";
import { withoutHost } from "../../src";

// From unjs/ufo#212
describe("withoutHost", () => {
  test("strips protocol and host, keeping path, query and hash", () => {
    expect(withoutHost("https://example.com/test?foo=123#hash")).toBe("/test?foo=123#hash");
    expect(withoutHost("http://localhost:8000/media/search/movie?query=drive")).toBe(
      "/media/search/movie?query=drive",
    );
  });

  test("an origin with no path becomes '/'", () => {
    expect(withoutHost("https://example.com")).toBe("/");
  });

  test("host-less inputs still get a leading '/'", () => {
    expect(withoutHost("?foo=123#hash")).toBe("/?foo=123#hash");
    expect(withoutHost("?")).toBe("/?");
  });
});
