# RFC 3339 seconds in datetime

`z.iso.datetime()` (and `z.string().datetime()`) currently accepts `2022-10-13T12:52Z`,
with no seconds. RFC 3339 requires seconds whenever a timestamp carries a time-zone
designator, so downstream parsers in other languages reject what Zod accepted. We are
fixing this in the next major release.

The regex is built by `datetime(args)` in `src/v4/core/regexes.ts`. It uses
`timeSource(args)` for the time part. Change only that file (plus the tests that pin the
old behavior).

## Exact behavior

Let `HH:MM` be the hour and minute, `:SS` the seconds, and `.f+` one or more fraction digits.

1. **No `precision` given (the default).**
   - A time followed by `Z`, or by an offset when `offset: true`, **must** have seconds:
     `HH:MM:SS` or `HH:MM:SS.f+`. `HH:MM` followed by `Z` or an offset is rejected.
   - When `local: true`, the time may also appear with **no** suffix. In that
     unqualified form, seconds stay optional: `HH:MM`, `HH:MM:SS` and `HH:MM:SS.f+` all pass.
2. **Explicit `precision` (any number, including `-1`, `0`, `3`).** The behavior is
   unchanged from today, with or without a suffix. For example,
   `z.iso.datetime({ precision: -1 })` still accepts `2022-10-13T12:52Z`.
3. Offsets keep their current shape (`+HH:MM` / `-HH:MM`). `+02` alone is still rejected.
4. The date part, the leap-year logic, the `time()` regex and everything else in the file
   are unchanged.
5. `toJSONSchema` keeps emitting `format: "date-time"` for the default datetime.

## Examples

| Schema | Input | Result |
|---|---|---|
| `z.iso.datetime()` | `2022-10-13T12:52Z` | fail |
| `z.iso.datetime()` | `2022-10-13T12:52:00Z` | pass |
| `z.iso.datetime()` | `2022-10-13T12:52:00.123Z` | pass |
| `z.iso.datetime({ offset: true })` | `2022-10-13T12:52+02:00` | fail |
| `z.iso.datetime({ offset: true })` | `2022-10-13T12:52:00+02:00` | pass |
| `z.string().datetime({ local: true, offset: true })` | `2022-10-13T12:52` | pass |
| same | `2022-10-13T12:52Z` | fail |
| same | `2022-10-13T12:52:00+02` | fail |
| `z.iso.datetime({ precision: -1 })` | `2022-10-13T12:52Z` | pass |

## Tests
Update the existing datetime tests that assert the old behavior, and add cases for the
table above.
