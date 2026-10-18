## Intended approach
In `parseIntersection`, after tokenizing, detect a standalone `-` token. If present, require exactly
three tokens `[A, "-", B]` where A and B parse with `parsePartial` and have no operator prefix.
Otherwise throw via the existing `bad()` helper. Desugar:
lower = major null ? none : `>=` (M, m ?? 0, p ?? 0, pre); upper = major null ? none : full ? `<=B`
: minor null ? `<M+1.0.0-0` : `<M.m+1.0-0`. Reuse `sv` and `LOWEST`. Combining `||` works
automatically because splitting on `||` happens first.

## Key files
- `src/semver/range.ts` (`parseIntersection`, `bad`, `sv`, `LOWEST`, `primitive`)
- `src/semver/parse.ts` (`parsePartial`)

## Traps
- **Partial upper bound is exclusive of the next minor/major.** Zero-filling (`2.3` -> `<=2.3.0`) is the classic
  literal-agent result. It wrongly rejects `2.3.9` for `1.2.3 - 2.3`.
- Missing the `-0` suffix on the exclusive upper bound changes `toString()`, and it changes prerelease semantics.
- Detecting hyphens with `includes("-")` breaks `1.2.3-2.3.4` and every prerelease version.
- The operator-gluing regex runs first. `>=1 - 2` has to be rejected, not glued.
- `* - *` must render `*` (empty comparator set), not an empty string.
- Error paths: `1 - 2 - 3`, `- 2`, `1.2.3 -`, `1 - 2 <3` (extra tokens).

## Strong signals
- Specifies the upper-bound rule as a rule (partial means "everything inside that partial") and gives the agent the `-0` reason.
- Points the agent at `parsePartial`, `sv` and `LOWEST` instead of letting it invent a parser.
- Enumerates error cases and the "no spaces = prerelease" case explicitly.
- Asks for tests from the table, including a satisfies check on `2.3.9`.

## Weak signals
- "Support hyphen ranges like npm" with no boundary rules.
- Accepts `<=2.3.0` output without checking.
- Doesn't mention whitespace, so the agent splits on every `-`.

## Follow-up questions
- Why is the upper bound `<2.4.0-0` instead of `<2.4.0`? Construct a version where the difference matters.
- Should `1.2.3-rc.1 - 2.0.0` admit `1.5.0-beta.1`? Why not?
- How would you make `Range#toString()` round-trip (`new Range(r.toString())` equals `r`) and test that property?
- What's the right behavior for `2.0.0 - 1.0.0` (inverted)? Error or empty range?
