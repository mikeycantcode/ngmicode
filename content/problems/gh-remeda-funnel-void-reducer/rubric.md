## Intended approach
`funnel` uses the reducer's return value for two jobs: it is the executor's argument,
**and** `preparedData !== undefined` is how funnel knows a call happened during the
current window. When no reducer is passed, a default `voidReducer` returns `""` so the
second job still works, and then `callback(param)` forwards that `""`.
The fix (remeda #1115) keeps a non-undefined sentinel but makes it private and
recognizable: `const VOID_REDUCER_SYMBOL = Symbol(...)`, `voidReducer` returns it, and
the invoke step calls `callback()` with no arguments when `param === VOID_REDUCER_SYMBOL`,
otherwise `callback(param)`.

## Key files
- `src/funnel.ts` (`voidReducer`, `preparedData`, the invoke function)
- `src/funnel.test.ts`
- `src/debounce.ts` (a consumer; should not need changes)

## Traps
- **Making `voidReducer` return `undefined`.** It looks like the obvious fix and makes
  the first call pass, but `preparedData === undefined` now means "no calls", so the
  trailing-edge invocation never fires. The hidden "handles multiple calls" test
  catches it (expects 2 calls after the quiet period).
- **Checking `reducer === undefined` at call time** but forgetting the default
  parameter already replaced it, or threading a flag through only one of the
  invoke paths (leading vs trailing vs `minGapMs`).
- **Dropping falsy values**: `if (param) callback(param) else callback()` breaks
  reducers that legitimately return `""`, `0` or `false`.
- Using a string sentinel such as `"__void__"`: a reducer could return it.

## Strong signals
- Reads the code before editing and explains the dual role of `preparedData`.
- Asks the agent to show every place `preparedData` is read or reset.
- Writes the multi-call trailing-edge test, not just the single leading call.
- Chooses a `Symbol` sentinel and explains why.

## Weak signals
- Asks the agent to "fix the empty string bug" and accepts a `return undefined` patch.
- Only tests `triggerAt: "start"`.

## Follow-up questions
- Why does funnel need a non-`undefined` value even with no reducer? What would you change in the design to avoid the sentinel?
- What happens if a user's reducer returns `undefined`? Is that a bug or a feature?
- How would you test this deterministically without real timers?
- TypeScript types the void executor as zero-arg; why didn't the type checker catch the bug?
