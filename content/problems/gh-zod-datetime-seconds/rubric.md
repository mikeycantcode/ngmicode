## Intended approach
This is a small, exact change in `src/v4/core/regexes.ts`. The real PR (#6457):
- Gives `timeSource` an optional `seconds?: boolean`. When `precision` is not a number
  and `seconds` is true, it emits `HH:MM:[0-5]\d(?:\.\d+)?` (mandatory seconds) instead of
  `HH:MM(?::[0-5]\d(?:\.\d+)?)?`.
- In `datetime`, builds the qualified alternative
  `timeSource({ precision, seconds: true })(?:Z|offset)`. With `local`, it ORs in the
  unqualified `timeSource({ precision })` with no suffix:
  `T(?:qualified|unqualified)`. Without `local`, it uses only the qualified form.
- Explicit numeric precisions ignore `seconds`, so their behavior is unchanged.
Then update `tests/datetime.test.ts` (the old test asserted that `12:52Z` and
`12:52+02:00` pass under `local + offset`).

## Key files
- `src/v4/core/regexes.ts` (`timeSource`, `datetime`)
- `src/v4/classic/tests/datetime.test.ts`

## Traps
- **Requiring seconds everywhere.** That breaks the unqualified `local` form
  (`2022-10-13T12:52` must still pass under `local: true`). The hidden test covers it.
- **Making the suffix optional with `?` on the seconds-mandatory time.** The old code did
  `time(?:Z|offset)?` for local. Keeping that shape with mandatory seconds rejects
  `12:52` local. Keeping optional seconds accepts `12:52Z`. The fix needs an alternation.
- **Touching explicit precision.** `precision: -1` must still accept `12:52Z`.
- **Editing `time()`** or the offset regex. Both are out of scope.
- A spec that does not mention the visible tests lets the agent guess. The brief asks for it; penalize omitting it.

## Strong signals
- Hands the agent the exact regex structure (alternation for local) or the exact
  pass/fail table, and names both functions.
- Says explicitly "do not change `time()` or the numeric-precision branches".
- Runs the datetime tests and checks each table row.

## Weak signals
- "Make datetime require seconds" with no mention of `local` or `precision`.
- Several correction rounds because the spec left boundary cases open.

## Follow-up questions
- This is a breaking change. How would you tell users to keep the old behavior?
  (The docs point to `z.union([z.iso.datetime(), z.iso.datetime({ precision: -1 })])`.)
- Why does an explicit precision drop `format: "date-time"` in JSON Schema?
- RFC 3339 also allows a lowercase `t`/`z` and a space separator. Should Zod accept them?
- How would you test a regex like this beyond hand-picked examples?
