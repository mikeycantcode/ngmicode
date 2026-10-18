## Intended approach
Move `dataset.value = output` into an `else` branch of the `output === undefined` check, so
the assignment only runs when stringify produced a string. The candidate should tell the
agent the exact branch to change, and the exact test to update (the function-input
case currently asserts `value: undefined`), plus a new symbol-input case with
`received: 'symbol'`.

## Key files
- `src/actions/stringifyJson/stringifyJson.ts` (`~run`)
- `src/actions/stringifyJson/stringifyJson.test.ts` (the `for function input` case asserts the old behaviour)
- `src/actions/parseJson/parseJson.ts` (reference for the consistent failure behaviour)

## Traps
- **Leaving the stale test.** The visible test `for function input` encodes the bug. A spec
  that only covers the source leaves a red test, or worse, a candidate "fixes" the source
  back to match the test.
- **Over-scoping.** An agent told "make failures consistent" may rewrite the catch
  block, change `received` strings, or touch `parseJson`. The prompt forbids that.
- **`undefined` input.** For `value: undefined` the old and new outputs are identical, so a
  test with `undefined` alone proves nothing. Strong candidates notice and use a function or
  symbol to prove the fix.
- **Assigning `dataset.value = dataset.value`** or cloning the input: the test uses
  `toStrictEqual` with the same function/symbol reference; it must be the original value.

## Strong signals
- Names the exact line and the exact branch structure (`if (output === undefined) {...} else {...}`).
- Explicitly tells the agent to update the existing function-input test and add a symbol case.
- Explains why `undefined` input cannot distinguish old from new behaviour.
- Runs the stringifyJson tests and reads the result before declaring done.

## Weak signals
- "Fix stringifyJson so it doesn't lose the value" with no scope limits.
- Accepts a diff that also touches the catch path or issue fields.
- Does not run tests.

## Follow-up questions
- Why should a failed transformation keep its input at all? Who consumes `dataset.value` when `typed` is false?
- A `replacer` that returns `undefined` for the root key also hits this path. Is that a user error or a valid case? How would you test it?
- Should `received` for a function be `'Function'` or something more descriptive? What would changing it break?
- How would you find other actions in the library with the same "overwrite after issue" pattern?
