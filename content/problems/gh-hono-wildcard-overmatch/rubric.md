## Intended approach
Reproduce first: write a tiny script or test that registers `/path/*` and `/assets*` on each
router (`LinearRouter`, `PatternRouter`, `RegExpRouter`, `TrieRouter`, via `SmartRouter` too)
and matches the table. `RegExpRouter` and `TrieRouter` are correct; `LinearRouter` and
`PatternRouter` over-match. Root cause in both: a trailing `*` was handled by **chopping the
last two characters** (`slice(0, -2)`), which assumes the route ends in `/*`. For `/path/*`
that leaves `/path` and then matches any string with that prefix (no boundary check).
For `/assets*` it chops the `s` too, so `/asset` matches.

The merged PR (honojs/hono#5252):
- PatternRouter: choose a suffix per shape — `/*` → `(?:$|/)`, bare `*` → `''`, otherwise `/?$` —
  and strip only the `*`.
- LinearRouter: distinguish `endsWithSlashStar` from `endsWithStar`; slice 2 vs 1 chars; for
  `/*`, require the next char after the matched prefix to be `/` or end of path.
- Move the regression cases into `src/router/common.case.test.ts` so every router runs them.

## Key files
- `src/router/pattern-router/router.ts` (`add`)
- `src/router/linear-router/router.ts` (`match`, the `hasStar && !hasLabel` branch)
- `src/router/common.case.test.ts` (shared cases used by every router's test file)
- `src/router/reg-exp-router`, `src/router/trie-router` (correct reference behavior)

## Traps
- **Fixing one router**: the brief says "routers disagree"; both Linear and Pattern are wrong.
- **Over-correcting `/assets*`**: treating every trailing `*` as `/*` breaks `/assets-v2`.
- **`/path` itself must still match `/path/*`** (and `/path/`). A naive `/.*` suffix loses that.
- **Middle wildcards**: `/a/*/b/*` — the fix must apply only to the trailing segment; the
  LinearRouter loop handles parts split by `/*/`.
- Writing the regression test only for the router being fixed, instead of the shared common cases.
- Editing `RegExpRouter`/`TrieRouter` "for consistency" and breaking them.

## Strong signals
- Builds a cross-router repro matrix before changing code.
- States the root cause precisely (`slice(0, -2)` assumes `/*`; no segment boundary check).
- Adds cases to the shared common test file and runs every router's suite.
- Reviews the agent's regex for anchoring and the `/path/` trailing-slash case.

## Weak signals
- Accepts a fix verified only against the reporter's exact URL.
- Can't explain why the default router was unaffected.
- Lets the agent rewrite a router wholesale.

## Follow-up questions
- Why is having one shared test suite for all routers valuable here? What would you add to it next?
- The bug is a security issue for `app.use('/admin/*', auth)`. How would you communicate and release this fix?
- How does `SmartRouter` pick a router, and could a user hit different behavior in dev vs prod?
- What is the perf impact of the `(?:$|/)` suffix vs the old version?
