## Intended approach
Reproduce with `new Mdkit().render("1. a\n\n2. b")` and see two `<ol>`s. The regression is
in `src/block/rules/list.ts`. After collecting an item, the #212 change made
`if (trailingBlanks > 0) break;` unconditional. The correct logic peeks at the next line:
if it is a list marker of the **same** list (`sameList`), continue and mark the list loose
(`node.tight = false`); otherwise end the list. #212 itself was never caused by this branch;
lazy continuation handles it. The visible test `ends the list at a blank line (#212)` was
rewritten to assert the buggy output. It must be restored to expect one loose `<ol>`.

## Key files
- `src/block/rules/list.ts` (the trailing-blank-line branch, `sameList`, `node.tight`)
- `tests/block.test.ts` (the test that was changed to match the bug)
- `src/render/html.ts` (`listItem` tight vs loose, to understand the output)

## Traps
- **The test was changed to match the bug.** An agent that "fixes" the code sees a red
  test and may revert its fix, or "fix" the test the wrong way. The candidate must
  recognize the test as wrong and correct it.
- **Forgetting looseness.** Deleting the `break` merges the lists but leaves them tight
  (`<li>Install</li>`). Hidden tests 1 and 2 check the `<p>` wrappers.
- **Re-breaking #212.** Treating any blank line as "continue" (without the `sameList`
  check on the next marker) must still end the list before `after` and before a `*` list.
  Hidden test 3 checks this.
- **Nested lists.** Blank lines inside a nested list are absorbed by the parent item's
  indentation and must not split the outer list. Hidden test 4 checks this.

## Strong signals
- Reproduces the bug before reading code, and diffs behavior against the CommonMark rule.
- Notices that the #212 comment and the test name were changed together, and treats the
  test as suspect.
- Asks the agent for a minimal fix in the one branch, plus tests for the #212 case, the
  mixed-marker case and the loose rendering.
- Explains the green-suite question: the regression test encoded the regression.

## Weak signals
- Accepts the agent's first change without checking loose rendering.
- Deletes the failing test rather than correcting it.
- Rewrites the list rule wholesale.

## Follow-up questions
- Why were the tests green? What process change would have caught a test being rewritten to match a bug?
- CommonMark decides looseness per list, not per item. Where in this code is that decided, and is the "blank between children" heuristic correct for fenced code inside an item?
- How would you build a regression corpus (e.g., the CommonMark spec examples) into CI?
- What did #212 actually need, and which code path handles `- a\n\nparagraph` today?
