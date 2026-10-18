## Intended approach
Candidate gives the literal agent a precise algorithm. Walk the AST with the existing
`walk()` helper. Collect one string per heading/paragraph/table cell using the existing
`toText()`, which already handles emphasis, links, inline code, image alt and breaks.
Optionally add code block values. Join the chunks with whitespace, split on `\s+`, and keep
tokens matching `/[\p{L}\p{N}]/u`. Then do the `ceil` minutes math and the `RangeError`
validation with the exact message.

## Key files
- `src/render/stats.ts` (the stub)
- `src/core/ast.ts` (`walk`, `toText`, node types)

## Traps
- **`toText(root)` merges blocks.** `toText` on the root concatenates paragraphs with no
  separator, so `Title` + `start` becomes `Titlestart`. Hidden test 1 catches this.
- **Code blocks.** `toText(root)` silently drops `code` nodes, because they are not
  parents. So `includeCode` does nothing unless code is handled explicitly.
- **Punctuation tokens.** A plain `split(/\s+/)` counts `—`, `?` and `|`. An ASCII-only
  `\w` test drops `東京` and `Café`.
- **Minutes edge cases.** `0` words → `0` minutes, but 1 word → `1` minute. `Math.round`
  instead of `ceil` gives the wrong answer for 201 words.
- **wpm validation.** `2.5` must throw; a `> 0` check alone lets it through.

## Strong signals
- Names the helpers to reuse (`walk`, `toText`) and the node types to visit.
- States the separator rule explicitly, and that the walk must not descend twice.
- Gives the exact regex or the Unicode property classes, and the exact error message.
- Asks the agent for a few quick checks with the table examples before finishing.

## Weak signals
- "Count the words in the document and compute reading time" with no definition of a word.
- Lets the agent invent its own text extraction and does not check block boundaries.
- Discovers `includeCode` is a no-op only after a failure.

## Follow-up questions
- Why does `toText(root)` merge words across paragraphs, and would you change `toText` itself? What else depends on it?
- How would you count CJK text, where words are not separated by spaces?
- Should link URLs or image file names count as words? Why or why not?
- How would you cache this if the badge is computed on every page view?
