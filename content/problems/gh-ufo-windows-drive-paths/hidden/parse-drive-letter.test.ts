import { describe, expect, test } from "vitest";
import { parseURL } from "../../src";

describe("parseURL drive-letter normalization", () => {
  // From unjs/ufo#246
  test("does not strip the slash before 'x:' segments in non-file URLs", () => {
    expect(structuredClone(parseURL("https://test.com/t:est"))).toEqual({
      auth: "",
      hash: "",
      host: "test.com",
      pathname: "/t:est",
      protocol: "https:",
      search: "",
    });
  });

  // Pre-existing behavior that must survive the fix
  test("still normalizes Windows drive letters in file:// URLs", () => {
    expect(parseURL("file:///C:/home/user").pathname).toBe("C:/home/user");
  });
});
