import { it, expect } from "testkit";
import { Slugger, slugify } from "../../src/render/slugger";
import { createProcessor } from "../../src/api/processor";

it("keeps Unicode letters, marks and numbers", () => {
  expect(slugify("Café Crème")).toBe("café-crème");
  expect(slugify("Café")).toBe("café"); // decomposed é: combining mark kept
  expect(slugify("Über uns")).toBe("über-uns");
  expect(slugify("日本語 ガイド")).toBe("日本語-ガイド");
  expect(slugify("Step ² of 3")).toBe("step-²-of-3");
});

it("removes punctuation and symbols but never collapses or trims dashes", () => {
  expect(slugify("C++ & C#")).toBe("c--c");
  expect(slugify("a - b")).toBe("a---b");
  expect(slugify("--flag_name")).toBe("--flag_name");
  expect(slugify("🚀 Launch!")).toBe("-launch");
  expect(slugify("  What's new?  ")).toBe("whats-new");
  expect(slugify("tab\there")).toBe("tab-here");
});

it("keeps de-duplication and the empty fallback", () => {
  const s = new Slugger();
  expect(["Café", "café", "Café 1", "!!!", "🎉"].map((t) => s.slug(t))).toEqual(["café", "café-1", "café-1-1", "section", "section-1"]);
});

it("flows through to rendered heading ids", () => {
  const res = createProcessor().process("## Größe & Gewicht\n\n## Größe & Gewicht");
  expect(res.html).toContain('<h2 id="größe--gewicht">');
  expect(res.html).toContain('<h2 id="größe--gewicht-1">');
});
