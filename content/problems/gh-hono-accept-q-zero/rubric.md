## Intended approach
Locate the two consumers that *choose* a value: `defaultMatch` in
`src/helper/accepts/accepts.ts` (used by `accepts()` when no custom `match` is given) and
`detectFromHeader` in `src/middleware/language/language.ts`. The merged PR
(honojs/hono#5311) filters `q > 0` in `defaultMatch` before sorting (which also drops the
`.slice()` copy), and `continue`s on `q === 0` in `detectFromHeader`'s loop. Returning
`undefined` from the header detector already makes the language middleware try the next
detector. Use `src/middleware/compress/index.ts` (`q > 0`) as the precedent. Add tests for both.

## Key files
- `src/helper/accepts/accepts.ts` (`defaultMatch`)
- `src/middleware/language/language.ts` (`detectFromHeader`)
- `src/utils/accept.ts` (`parseAccept`, which must stay unchanged)
- `src/middleware/compress/index.ts` (existing `q > 0` rule)

## Traps
- **Fixing in the parser**: filtering `q=0` in `parseAccept`/`parseAcceptLanguage` is the
  tempting one-line fix. It changes what custom `match` functions receive. The prompt forbids it.
- **Second consumer**: fixing `accepts()` but not the language detector (or vice versa).
- **Wildcards**: `application/*;q=0` must also block `application/json`; a fix that only
  compares exact types misses it. Filtering by `q` before matching handles both.
- **Language fallback**: returning the fallback language directly from the header detector
  (instead of `undefined`) skips the remaining detectors in `order`.
- A weak agent may truncate files and "fix" a `q` parsing helper it saw first.

## Strong signals
- Asks the agent to list every caller of the accept parsers before editing.
- Feeds the agent the RFC rule and the compress precedent explicitly.
- Checks the "continue to the next detector" path with a query-string test.
- Runs the existing accepts and language suites.

## Weak signals
- Accepts a parser-level filter.
- Tests only `accepts()`.

## Follow-up questions
- Why is it important that the parser keeps `q=0` entries? Give a custom `match` that needs them.
- `Accept: */*;q=0, text/html` — what should `accepts()` return for `supports: ['application/json']`?
- Should a `q=0` exact entry override a positive wildcard (`application/json;q=0, */*`)? What does RFC 9110 say about specificity?
- How would you find other consumers of quality values in a codebase this size?
