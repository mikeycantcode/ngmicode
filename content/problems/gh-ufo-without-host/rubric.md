## Intended approach
Orient first. Find where the `with*`/`without*` helpers live (`src/utils.ts`), how they
are exported (`src/index.ts` re-exports `./utils`), and which parser they share
(`parseURL` in `src/parse.ts`). The reference (unjs/ufo#212) is three lines:
```ts
export function withoutHost(input: string) {
  const parsed = parseURL(input);
  return (parsed.pathname || "/") + parsed.search + parsed.hash;
}
```
It needs a JSDoc block (`@group utils`, `@example`) and a README section between
`withoutFragment` and `withoutLeadingSlash`. Tests go in `test/utilities.test.ts` as a
table, like the neighbouring `describe` blocks.

## Key files
- `src/utils.ts` — siblings `withoutFragment`, `withoutProtocol`, `withoutBase`
- `src/parse.ts` — `parseURL`, `parsePath`, `ParsedURL`
- `src/index.ts`, `README.md`, `test/utilities.test.ts`

## Traps
- Using `new URL(input)`. It throws on `?foo=123#hash` and other relative input,
  and it re-encodes the path. Both violate the acceptance criteria.
- Rebuilding with `stringifyParsedURL({ ...parsed, protocol: "", host: "" })`. A
  protocol-relative marker or `auth` can leak, and empty pathnames don't get `/`.
- Forgetting `pathname || "/"`. `https://example.com` and `?` then come out without the
  leading slash. The hidden tests check this.
- Hand-rolled regexes that miss ports, credentials (`user:pass@host`) or backslashes.
- Adding a second `export` in `index.ts` when `export *` already covers it.

## Strong signals
- Spends the first minutes on orientation: asks the agent for the sibling helpers, the
  shared parser and the test conventions before writing code.
- Has the agent reuse `parseURL` and shows why (relative inputs, no throw).
- Adds table-driven tests in the existing style. Includes credentials or a port.
- Probes the security edge: `withoutHost("https://example.com//evil.com")` returns
  `//evil.com`, which is protocol-relative. The candidate flags it even if it's out of
  scope for the acceptance criteria.

## Weak signals
- Lets the agent create a new file or module for one function.
- Accepts a `new URL()` implementation because the absolute-URL examples pass.
- Skips the README/JSDoc criteria.

## Follow-up questions
- `withoutHost("https://a.com//evil.com")` returns `"//evil.com"`. If a framework feeds this into a redirect, what happens? How would you fix it, and is that the helper's job?
- Should `withoutHost` decode or normalize the path, or preserve it byte-for-byte? Why?
- How would you name and design the inverse (`withHost`)? What inputs make it ambiguous?
- What's your test strategy for a function whose correctness depends entirely on `parseURL`?
