# Front matter test coverage

The front matter parser (a small YAML subset) has only two smoke tests (see the TODO
in the test file). Before we add nested-map support next sprint, we want real coverage
of what it already claims to support.

## The ask

Write tests for the documented behavior below. Where a test fails, decide whether the
test or the code is wrong. Fix the code if the code is wrong. Report which bugs you found.

## Documented behavior

1. `key: value` pairs. The value is **everything after the first `: `**, trimmed.
2. Scalars: numbers (`42`, `-1.5`), `true`/`false`, `null`/`~`/empty → null, plain strings.
3. Quoted strings (`"…"` with `\"` escapes, `'…'` with `''`) are always strings, even
   when they look like numbers or booleans.
4. Inline lists `[a, "b, c", 3]` and block lists (`key:` followed by `- item` lines).
5. `#` starts a comment only when it is outside quotes **and** at the start of the line
   or preceded by whitespace. So `c#-intro` is a value, and `"C# tips"` is a value.
6. Errors are `FrontMatterError` with the 1-based line number of the original file.
   Examples: no colon, a missing space after the colon (`a:b`), nested maps.
7. The front matter block must start on the first line with `---` and end with `---` or
   `...`. Otherwise the whole document is body. CRLF input works.

## Constraints

- Tests go in `tests/frontmatter.test.ts` (extend it).
- Your agent is a small model. Keep each request small.
