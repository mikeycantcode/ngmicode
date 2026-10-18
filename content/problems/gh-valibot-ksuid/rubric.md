## Intended approach
Copy the conventions of a sibling ID action (`ulid` is the closest) rather than inventing a
new shape:
1. `src/regex.ts`: add `export const KSUID_REGEX: RegExp = /^[a-zA-Z0-9]{27}$/u;` with a doc comment.
2. `src/actions/ksuid/ksuid.ts`: `KsuidIssue`, `KsuidAction`, two overloads, and an
   implementation that returns `{ kind, type, reference, async, expects, requirement, message, '~run' }`
   and calls `_addIssue(this, 'KSUID', dataset, config)` only when `dataset.typed` and the regex fails.
3. `src/actions/ksuid/index.ts` re-export, plus `export * from './ksuid/index.ts'` in
   `src/actions/index.ts` (alphabetical).
4. `src/actions/ksuid/ksuid.test.ts` modelled on `ulid.test.ts`.
A strong candidate points the agent at `ulid` explicitly as the template and lists
the exact object keys and the label string.

## Key files
- `src/regex.ts`
- `src/actions/ulid/ulid.ts` (template), `src/actions/ulid/ulid.test.ts`
- `src/actions/index.ts` (barrel export)
- `src/utils/_addIssue/_addIssue.ts` (how `label` becomes the default message)

## Traps
- **Missing barrel export.** The action works when imported by path but `v.ksuid` is
  undefined. Penalize a spec that omits the export line, even if the agent adds it.
- **Regex inlined in the action** instead of an exported `KSUID_REGEX`: the hidden test
  compares `requirement` against `v.KSUID_REGEX`.
- **Unanchored or loose regex** (`\w{27}` accepts `_`; missing `^`/`$` accepts padded input).
- **Extra keys** on the action object (e.g. `expects: 'KSUID'`, a `label` field) break
  `toStrictEqual`.
- **Validating untyped datasets**: running the regex on a non-string after an earlier
  failure adds a bogus second issue.
- **Wrong label case** (`'ksuid'`), giving `Invalid ksuid: ...`.

## Strong signals
- Names `ulid` as the template and asks the agent to mirror it line by line.
- Lists the exact boundary cases (26/28 chars, whitespace, symbols) for the tests.
- Checks the barrel export by importing from the package root in a test.
- Mentions `@__NO_SIDE_EFFECTS__` / tree-shaking conventions when reviewing the diff.

## Weak signals
- "Add a KSUID validator like the others" and accepts the output unread.
- Does not run the test suite, or only tests the happy path.

## Follow-up questions
- KSUIDs encode a 160-bit number, so the max is `aWgEPTl1tmebfsQzFP4bxwgy80V`. Should the validator reject larger values? How would you implement that without BigInt?
- Why does valibot keep each regex as an exported constant instead of inline?
- How would you keep 100+ actions consistent as contributors add more? Lint rule, generator, shared test helper?
- When is a separate action better than a `regex()` call the user writes themselves?
