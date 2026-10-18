## Intended approach
Trace `String(doc)` → `stringifyDocument` → `stringifyCollection` → `stringifyPair`. An empty
value is composed as a `null` Scalar positioned *after* the blank line, so it gets
`spaceBefore = true` (`vsb`). In `stringifyPair`, `ws` (the text between `key:` and the value)
then starts as `'\n'`. For an empty value outside flow context, the code had
`if (ws === '\n') ws = '\n\n'`, so the pair renders as `item:\n\n`. The collection then joins
items with `\n`, which produces two blank lines. The doubling is only right when the empty
value carries a trailing comment (`valueComment`). For `a:\n\n  #c`, the comment is appended
after `ws`, so `ws` must hold both the line break and the blank line. The upstream fix (PR #642, worded by
the maintainer in review) narrows the condition: `if (ws === '\n' && valueComment) ws = '\n\n'`.

## Key files
- `src/stringify/stringifyPair.ts` (the `keyComment || vsb || vcb` branch)
- `src/stringify/stringifyCollection.ts` (how items and blank lines are joined)
- `src/compose/resolve-block-map.ts`, `src/compose/resolve-props.ts` (where `spaceBefore` is set)

## Traps
- **Deleting the line.** It passes the reported case and the visible suite, but loses the
  blank line for `a:\n\n  #c\nb: 1\n` (it comes back as `a:\n  #c\nb: 1\n`). The acceptance
  criteria call this out. The grader should ask whether the candidate checked it.
- **Fixing it in the composer** by not setting `spaceBefore` on empty values. That changes the
  document model for every consumer to work around one stringifier branch.
- **Post-processing the output string** (collapsing `\n\n\n`). That is a hack and changes
  legitimate multi-blank-line output.

## Strong signals
- Asks the agent to explain `ws`, `vsb`, `vcb`, and `valueComment` before proposing a change.
- Asks *why* the doubling branch exists (`git blame` or tests) before removing it.
- Writes a regression test for both the reported input and an empty value with a comment.

## Weak signals
- Accepts the first one-line deletion the agent proposes.
- Can't explain where the blank line in the correct output comes from.

## Follow-up questions
- Where is the blank line that *should* appear actually emitted?
- What does `spaceBefore` mean on a node, and who sets it?
- Why does a trailing comment on an empty value need the extra newline?
- How would you build a round-trip property test for this library?
