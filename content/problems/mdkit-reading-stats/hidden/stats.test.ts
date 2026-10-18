import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";
import { readingStats } from "../../src/render/stats";

const md = new Mdkit();
const stats = (src: string, opts = {}) => readingStats(md.parse(src), opts);

it("counts words without merging across blocks and ignores punctuation-only tokens", () => {
  // "Title" + "end" must not merge into "Titleend" with the next paragraph's "start".
  expect(stats("# Title\n\nstart of *the* text end\n\n- one\n- two").words).toBe(8);
  expect(stats("well — this is state-of-the-art, isn't it ?\n\n---").words).toBe(6);
  expect(stats("a | b\n--|--\nc d | e").words).toBe(5);
  expect(stats("see ![a cat](/c.png) and `npm i`").words).toBe(6);
  expect(stats("Café 東京 42").words).toBe(3);
});

it("skips fenced code unless includeCode is set", () => {
  const src = "one two\n\n```js\nconst x = 1;\n```";
  expect(stats(src).words).toBe(2);
  expect(stats(src, { includeCode: true }).words).toBe(5);
});

it("rounds minutes up, with 0 only for empty documents", () => {
  expect(stats("")).toEqual({ words: 0, minutes: 0 });
  expect(stats("hi").minutes).toBe(1);
  const words = (n: number) => Array.from({ length: n }, () => "w").join(" ");
  expect(stats(words(200)).minutes).toBe(1);
  expect(stats(words(201)).minutes).toBe(2);
  expect(stats(words(10), { wordsPerMinute: 3 }).minutes).toBe(4);
});

it("validates wordsPerMinute", () => {
  expect(() => stats("x", { wordsPerMinute: 0 })).toThrow(RangeError);
  expect(() => stats("x", { wordsPerMinute: 2.5 })).toThrow("wordsPerMinute must be a positive integer");
});
