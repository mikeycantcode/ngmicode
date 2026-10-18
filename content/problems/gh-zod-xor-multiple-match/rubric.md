## Intended approach
Three small edits in three files (PR #6376):
1. `src/v4/core/schemas.ts`, `handleExclusiveUnionResults`: collect the indices of the
   results with no issues (`matches`) instead of filtering to `successes`. Use
   `matches.length` for the 0/1/many branches, and add `matches` to the multiple-match
   `invalid_union` issue.
2. `src/v4/core/errors.ts`: add `readonly matches: number[]` to
   `$ZodIssueInvalidUnionMultipleMatch`.
3. `src/v4/locales/en.ts`: in the `invalid_union` case, return
   `"Invalid input: more than one option matched"` when `issue.inclusive === false`,
   after the discriminator branch and before the generic `"Invalid input"`.

## Key files
- `src/v4/core/schemas.ts` (`$ZodXor`, `handleExclusiveUnionResults`)
- `src/v4/core/errors.ts` (`$ZodIssueInvalidUnion*` types)
- `src/v4/locales/en.ts` (error map)

## Traps
- **Message in the wrong layer.** A weak model tends to hard-code `message` on the issue in
  `schemas.ts`. That bypasses the locale system, so `customError` and other locales can no
  longer override it. Messages belong in the error map.
- **Branch order in `en.ts`.** The `discriminator` check comes first. The new branch must not
  swallow the zero-match case. Zero matches keep `inclusive` undefined and `errors` per option
  (hidden test).
- **Indices of the wrong array.** Recording positions after filtering (0..k-1) instead of
  option indices. `[0, 1, 2]` happens to match in the 3-way example. The 2-way example
  `[0, 1]` with `z.any()` also works. A test like `xor([z.number(), z.string(), z.any()])`
  on `"x"` should give `[1, 2]`.
- **Short-circuiting** after the second match. The ask says every matching option.
- Changing regular `z.union()` handling (`handleUnionResults`) by mistake. The two
  functions sit next to each other.
- The weak agent's truncated reads may miss that `en.ts` is a separate file from the issue
  construction.

## Strong signals
- Decomposes into the three edits and feeds the agent the relevant function each time.
- Points the agent at the existing `inclusive: false` field as the discriminator for the message.
- Checks the zero-match path and a non-contiguous `matches` case.
- Reviews the agent's diff for an accidental change to `handleUnionResults`.

## Weak signals
- One big prompt ("make xor errors better") and accepts whatever comes back.
- Message hard-coded in core.

## Follow-up questions
- Why is the message in the locale file rather than on the issue? What breaks for a
  French user if it is hard-coded?
- Should `errors` carry something for the multiple-match case? What would be useful?
- How does a user fix the overlap they hit (stripping objects)? `.strict()`? Ordering?
- Is adding `matches` to the issue type a breaking change for anyone?
