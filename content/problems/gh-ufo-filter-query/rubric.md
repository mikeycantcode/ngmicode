## Intended approach
This is a precision task: the score is the spec the candidate gives the agent.
The reference (unjs/ufo#287):
```ts
export function filterQuery(input, predicate) {
  if (!input.includes("?")) return input;
  const parsed = parseURL(input);
  const query = parseQuery(parsed.search);
  const filteredQuery = Object.fromEntries(
    Object.entries(query).filter(([key, value]) => predicate(key, value)));
  parsed.search = stringifyQuery(filteredQuery);
  return stringifyParsedURL(parsed);
}
```
`stringifyQuery({})` returns `""`, and `stringifyParsedURL` drops an empty search, so the
"no `?`" case falls out for free. But the candidate must *state* it, or verify it.

## Key files
- `src/utils.ts` (next to `withQuery` / `getQuery`)
- `src/query.ts` — `parseQuery`, `stringifyQuery`
- `src/parse.ts` — `parseURL`, `stringifyParsedURL`
- `src/index.ts` — already `export * from "./utils"` (a good candidate checks rather than adding a duplicate export)
- `README.md`, `test/query.test.ts`

## Traps
- Not telling the agent to reuse the existing parsers. A vague spec lets it hand-roll
  `split("&")` and break encoding, `+` handling and repeated keys.
- Leaving a dangling `?` when everything is filtered out (`"/foo?"`).
- Using `getQuery(input)` but rebuilding the URL by string concatenation. That loses
  or duplicates the hash.
- Re-encoding an input with no `?`. Early-return keeps it byte-identical.
- Omitting docs from the spec. Penalize it even if the agent writes some anyway.
- Predicate signature: passing only `key`, or splitting repeated keys into multiple calls.

## Strong signals
- The first instruction is a complete spec: signature, location, reuse list, edge cases, docs.
- Names the exact helpers to reuse and the order of operations.
- Asks for tests that cover the empty-result and no-query cases, plus one with a hash and repeated keys.
- Reviews the diff against the spec before accepting it.

## Weak signals
- "Add a filterQuery function that filters query params" and then several correction rounds.
- Doesn't check how repeated keys reach the predicate.
- Accepts output without running the tests.

## Follow-up questions
- `parseQuery` decodes `+` to a space. Is a filter → stringify round-trip lossless for every input? Give a counterexample if not.
- Should the predicate also receive the index or the raw (undecoded) value? What would that cost the API?
- How would you implement `withoutQueryParams(input, keys[])` on top of this, and would you?
- What happens with `__proto__` or `constructor` keys, and why?
