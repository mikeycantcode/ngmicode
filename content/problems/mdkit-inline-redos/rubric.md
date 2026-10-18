## Intended approach
Profile or bisect each input to its hot spot. The candidate should explain each root
cause, not just patch it.
1. `src/inline/rules.ts` `newline()`: `/ {2,}$/` and `.replace(/[ \t]+$/, "")` on the
   pending text are polynomial ReDoS. The engine retries from every space in a long run that
   isn't at the end, which is O(n²). Fix: count trailing spaces/tabs with a backwards loop
   and slice. (`trimEnd()` is also linear but trims more than spaces and tabs.) The same
   `/[ \t]+$/` pattern appears in `paragraph.ts` on the final raw string. Fix it there too
   (the base has `trimEndSpaces` in `util/strings.ts`).
2. `src/inline/emphasis.ts` `processEmphasis`: the `openersBottom` optimization is missing.
   Each closer scans back over every earlier delimiter, which is O(n²). Fix: keep a lowest
   search index per closer kind, keyed by char + `canOpen` + `origLength % 3` as CommonMark
   specifies. Set it to the closer's index when a search fails.
3. `src/block/rules/paragraph.ts` `REF_DEF`: one regex with adjacent ambiguous
   whitespace quantifiers (`[ \t]+` / `[ \t]*\n[ \t]*` before the title, and `[ \t]*` after)
   backtracks O(n²) when the title fails to match. Fix: parse by hand, or make the
   whitespace unambiguous.

## Key files
- `src/inline/rules.ts` (`newline`)
- `src/inline/emphasis.ts` (`processEmphasis`)
- `src/block/rules/paragraph.ts` (`REF_DEF`, `extractReferences`, the trailing trim)
- `src/util/strings.ts` (`trimEndSpaces` already exists. Reuse it.)

## Traps
- **Two regexes in `newline`.** Fixing only the `test` or only the `replace` leaves it slow.
- **The same pattern in `paragraph.ts`.** The trailing `.replace(/[ \t]+$/, "")` on the
  paragraph's raw text is also quadratic. Case 1 hits it through the second paragraph.
- **Wrong `openersBottom` key.** Keying only by char breaks rule-of-3 cases
  (`*foo**bar*` → `<em>foo**bar</em>`). Hidden test 2 checks those outputs.
- **Hard-break semantics.** `trimEnd()` also strips NBSP and other Unicode spaces. The
  check must still require 2+ spaces.
- **Ref-def rewrite regressions.** A hand parser must still allow a title on the next
  line, and must reject a definition with trailing junk. Hidden test 3 checks both.
- **Caps or timeouts.** These are explicitly out of scope and are a weak signal.

## Strong signals
- Times each input separately, before and after, and states the complexity.
- Recognizes trailing-whitespace regexes as a known ReDoS class (markdown-it/marked CVEs).
- Asks the agent to keep behavior identical and adds regression tests with timing budgets plus output checks.
- Searches the codebase for the same pattern elsewhere.

## Weak signals
- Lets the agent rewrite the inline parser wholesale.
- Adds `if (src.length > N)` guards.
- Fixes one input and declares victory, or can't explain why the regex is slow.

## Follow-up questions
- What makes a regex vulnerable to polynomial versus exponential backtracking? How would you lint for it?
- Explain `openersBottom`: why is it safe to never search below that index again for this closer kind?
- How would you continuously fuzz the parser in CI without flaky timing assertions?
- What defence-in-depth would you add at the service layer (worker isolation, per-request CPU budget)?
