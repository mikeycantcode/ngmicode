import { describe, it, expect } from "testkit";
import { extractFrontMatter } from "../src/index";

// TODO(mdkit#97): real coverage for the YAML subset. These are smoke tests only.
describe("front matter (smoke)", () => {
  it("extracts a title", () => {
    expect(extractFrontMatter("---\ntitle: Hello\n---\n# Body").data).toEqual({ title: "Hello" });
  });

  it("leaves documents without front matter alone", () => {
    expect(extractFrontMatter("# Hi").body).toBe("# Hi");
  });
});
