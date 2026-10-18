## Intended approach
1. Before delegating, find every call site. `globMatch` in `src/util/glob.ts` serves KEYS,
   `scan/cursor.ts` and `config.ts`. **PSUBSCRIBE goes through a separate recursive matcher in
   `src/pubsub/pattern.ts`.** Its comment even says "TODO: dedupe with util/glob".
2. Give the agent a precise spec. Tokenize the pattern into literal, any, star and class tokens
   (class = negate flag + singles + ranges), handling escapes and unterminated `[` as literal.
   Then keep the existing two-pointer star-backtracking loop, with "does token match char"
   replacing the char comparison.
3. Have the agent make `pubsub/pattern.ts` delegate to `globMatch`, or delete it and import
   `globMatch` in `broker.ts`. Tell it explicitly not to touch anything else.
4. Verify with quick tests: classes, ranges, reversed ranges, negation, `!` as literal, escapes,
   regex metacharacters, and PSUBSCRIBE.

## Key files
- `src/util/glob.ts`: the matcher.
- `src/pubsub/pattern.ts` and `src/pubsub/broker.ts`: the duplicate implementation PSUBSCRIBE uses.
- `src/commands/keys.ts`, `src/scan/cursor.ts`, `src/config.ts`: callers of `globMatch`.

## Traps
- **The duplicate matcher.** A spec that only says "edit `glob.ts`" leaves PSUBSCRIBE on the old
  matcher. Hidden test 3 subscribes with `news.[a-c]*`.
- **Regex translation.** Converting the glob to a `RegExp` without escaping breaks keys with
  `.`, `+` or `(`. It also violates the constraint. Hidden test 2.
- **`!` negation.** Many glob dialects use `[!a]`. The spec says only `^` negates.
- **Escape handling inside classes** (`[\]]`) and a trailing backslash.
- A recursive implementation per star is exponential on adversarial patterns. The rubric
  penalizes it, though the tests don't time it.

## Strong signals
- The candidate greps for every pattern consumer *before* writing the spec and spots `pattern.ts`.
- The spec to the agent lists files to touch and files not to touch, plus the exact rules and examples.
- The candidate keeps the iterative matcher and explains why recursion or regex is unsafe.
- The candidate reviews the diff for `*`/`?` regressions and runs the existing tests.

## Weak signals
- "Add [] support to glob.ts" and done.
- Accepting a regex-based rewrite.
- Not testing PSUBSCRIBE at all.

## Follow-up questions
- Your matcher is O(n·m) worst case. Construct a pattern that hits it, and say whether that is acceptable for `KEYS` on 10M keys.
- Should `SCAN MATCH` with a literal prefix (`user:42:*`) use an index instead of scanning? How would you build one?
- How does Redis treat `[` without `]`? Why might "literal" be a better choice for an embedded store?
- What changes if keys can contain astral-plane characters (surrogate pairs)?
