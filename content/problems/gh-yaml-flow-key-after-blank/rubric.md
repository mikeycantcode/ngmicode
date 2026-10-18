## Intended approach
The error is raised in the composer (`resolve-block-map.ts`), but the cause is in the CST
the parser builds. Dump `new Parser().parse(src)` for the working and failing input and
compare. After `1: 2` and a newline, the parser opens a new **empty** block-map item
(`{ start: [] }`, or `{ start: [comment] }` after a comment). When the next token is a
flow-collection start at map indent, `Parser#blockMap` goes to the `default:` branch and
`startBlockValue`. The `else if (atMapIndent)` clause then pushes a *second* new item, so the
first empty item is orphaned. The composer later sees an item with only a comment/space and
no key, and gives up. The upstream fix (PR #700) pushes a new item only when the current one
already has content: `atMapIndent && (it.sep || it.explicitKey || start.length > 0)`.
Otherwise the flow collection fills the existing empty item when it is popped.

## Key files
- `src/parse/parser.ts` (`blockMap`, the `default:` branch after `startBlockValue`)
- `src/compose/resolve-block-map.ts` (where the error surfaces, a red herring for the fix)
- `src/parse/cst.ts` (item shape: `start`, `key`, `sep`, `value`, `explicitKey`)

## Traps
- **Patching the composer.** Skipping or tolerating the orphaned item in
  `resolve-block-map.ts` hides the error but produces wrong ranges/comments, and goes against
  the constraint.
- **Dropping the `explicitKey` term.** In review, the maintainer asked for an explicit-key
  test. Without that term, `?\n[3]: 4` collapses into one garbled key. The hidden suite
  includes this case.
- **Guard too broad or too narrow.** Checking only `start.length` misses the blank-line case.
  Removing the push entirely breaks keys after a value on the same indent.
- The same branch serves block scalars and explicit keys. Changes must leave those paths alone.

## Strong signals
- Has the agent print the CST (`Parser`, or `CST.visit`) for passing vs failing inputs before
  touching code.
- States the invariant: an empty item must not be left behind when a new one is pushed.
- Tests the blank-line, comment, and empty-explicit-key variants, and runs the YAML spec
  example tests.

## Weak signals
- Lets the agent special-case the error code or string in the composer.
- Accepts a fix that passes the two reproductions without running the full suite.

## Follow-up questions
- Why does `1: 2\n[3]: 4` work but `1: 2\n\n[3]: 4` fail? Walk through the CST items.
- What is the role of `it.sep` and `it.explicitKey` in that condition?
- Is there a CST-level invariant you could assert in debug builds to catch this class of bug?
- How would you fuzz the parser to find similar cases?
