# Reading-time stats

The docs site wants a "5 min read" badge on every page. The function signature is
already stubbed in `src/render/stats.ts`:

```ts
readingStats(root: Root, opts?: { wordsPerMinute?: number; includeCode?: boolean }): { words: number; minutes: number }
```

Your instructions to the agent are graded for precision.
Only `src/render/stats.ts` should change.

## Required behavior

**What text is counted**

- Text in headings, paragraphs and table cells, including text inside emphasis,
  strong, links and inline code, and the **alt text** of images.
- Fenced code blocks are **not** counted, unless `includeCode: true`. Then the code
  block's full content is counted.
- Raw HTML (blocks or inline) is never counted.
- Text from different blocks must never join into one word. For example, a heading
  `# Title` followed by a paragraph `start` is 2 words, not 1. Line breaks inside a
  paragraph also separate words.

**What a word is**

- A word is a maximal run of non-whitespace characters that contains at least one
  Unicode letter or digit.
- So `—`, `?` and `|` alone are not words. `state-of-the-art` and `isn't` are each one
  word. `Café`, `東京` and `42` are each one word.

**Minutes**

- `wordsPerMinute` defaults to `200`. It must be a positive integer. Otherwise throw a
  `RangeError` with the message `wordsPerMinute must be a positive integer`.
- `minutes` is `0` when `words` is `0`. Otherwise it is `ceil(words / wordsPerMinute)`,
  so it is always at least `1`.

## Examples

| Markdown | words |
|---|---|
| `# Title` + blank line + `start of *the* text end` | 6 |
| `well — this is state-of-the-art, isn't it ?` | 6 |
| ``see ![a cat](/c.png) and `npm i` `` | 6 |
| `one two` + a fenced block containing `const x = 1;` | 2, or 5 with `includeCode` |

## Non-goals

Don't add CJK per-character counting. Don't wire this into the processor yet.
