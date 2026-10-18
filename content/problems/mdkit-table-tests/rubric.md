## Intended approach
The candidate turns each rule into one or two small, named tests (AST-level with
`parseBlocks` where shape matters, and HTML where rendering matters). They run the suite
and treat each red test as a potential bug. They confirm each one against the rule before
touching code, then fix `src/block/rules/table.ts`. Three bugs are injected:
- `alignOf` checks `left` before `left && right`, so `:-:` renders as left (rule 2/8).
- `splitRow` uses `split("|")`, ignoring `\|` escapes (rule 6). The fix also has to keep a
  trailing `\|` from being stripped as the closing pipe.
- `makeRow` no longer pads or truncates to the header width (rule 5). The
  `TODO: normalize row width` comment is the hint.

## Key files
- `src/block/rules/table.ts` (`splitRow`, `alignOf`, `makeRow`, rule)
- `src/render/html.ts` (`table()` rendering, style attributes)
- `tests/table.test.ts` (new)

## Traps
- **Tests written from the implementation.** Asking the agent to "write tests for
  table.ts" yields tests that assert current (buggy) behavior. All green, no bugs found.
  The candidate must make it test against the rules.
- **Weakening tests.** When a test goes red, an unsupervised agent often "fixes" the
  expectation. The brief forbids this.
- **Escaped pipe at end of row.** A naive `split(/(?<!\\)\|/)` fix still strips a trailing
  `\|` as the closing pipe. Hidden test 2 covers this.
- **Rendering vs parsing.** Padding fixed only in the renderer (`?? ""` at render time)
  leaves the AST wrong. The hidden tests check HTML, so either fix passes them. The
  grader should note which layer was chosen.
- **Snapshot-everything suites.** One giant expected HTML string per case is brittle and
  hides which rule broke.

## Strong signals
- Gives the agent the rule list and asks for one test per rule, with expected values
  derived from the rules, not from running the code.
- Reviews the generated tests and pushes back on any that only assert "it doesn't throw".
- Reports bugs → tests mapping clearly. Keeps fixes local.
- Notices the deleted tests in `block.test.ts` (there's a gap between "lists" and "raw HTML").

## Weak signals
- Accepts a generated suite that is entirely green without asking why.
- Changes expectations to make tests pass.
- Fixes bugs by inspection without tests, or writes tests after fixing so they never failed.

## Follow-up questions
- How do you keep an agent from writing tests that just mirror the implementation?
- Would you vendor the GFM spec examples as a conformance suite? What are the costs?
- Which of these tests would you write at the AST level and which at the HTML level? Why?
- How would you use mutation testing to check that the new suite actually guards the code?
