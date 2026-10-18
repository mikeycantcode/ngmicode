# Add `filterQuery`

You maintain **ufo**, a URL-utilities library. Users keep writing the same
three lines to drop tracking params (`utm_*`, `fbclid`) from URLs. They parse,
filter the entries, and re-stringify. We want a first-class utility.

Your instructions to the agent are graded for precision. Spell out the conventions,
edge cases, exports and docs you expect; vague instructions score low even if they work.

## The ask

Add a public function to `src/utils.ts`, exported from the package entry point:

```ts
filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string
```

It returns `input` with only the query parameters for which `predicate` returns `true`.

## Required behavior

- If `input` contains no `?`, return `input` unchanged, character for character.
- Otherwise parse `input` with the library's existing URL parser, and parse its
  query with the existing query parser. Repeated keys arrive as one entry whose
  value is a `string[]`. The predicate is called once per key, in query order.
- Re-stringify the kept entries with the existing query stringifier, then
  rebuild the URL with the existing URL stringifier. Protocol, host, path and
  hash are preserved.
- If no parameters survive, the result has no `?` at all.
  `filterQuery("/foo?bar=1", k => k !== "bar")` returns `"/foo"`.
- `filterQuery("/foo?bar=1&baz=2", k => k !== "bar")` returns `"/foo?baz=2"`.
- Add a JSDoc block with an `@example` and `@group utils`, matching neighbouring
  functions. Add a matching entry to the README utilities list, in alphabetical order.

## Non-goals

Don't change `parseQuery`, `stringifyQuery` or `withQuery`.
