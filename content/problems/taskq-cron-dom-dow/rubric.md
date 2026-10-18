## Intended approach

All changes are in `src/scheduler/cron.ts`:

- `dayMatches` uses the existing `domStar` / `dowStar` flags (already computed from "text starts
  with `*`"): `if (!domStar && !dowStar) return dom || dow; return dom && dow;`
- Day-of-week field max becomes 7. `*` keeps the range 0–6. Every value is normalised with
  `v === 7 ? 0 : v` as it is added to the set.
- `parseNumber` accepts a 3-letter name for month (index + 1) and day-of-week (index), using
  case-insensitive lookup, and throws `CronParseError` for unknown names. Names in other fields fall
  through to the existing "not a number" error.
- The visible test "requires both day fields to match" (Friday the 13th) and the `* * * * 7`
  rejection must be updated, since both behaviours changed deliberately.

## Key files

- `src/scheduler/cron.ts`
- `tests/cron.test.ts` (two assertions encode the old behaviour)

## Traps

- **The `*`-prefix rule.** Many people define "restricted" as "not exactly `*`", which makes `*/10`
  restricted and ORs it. Hidden test 2 (`0 0 */10 * 1`) catches this. The brief states the rule
  once.
- **`*` in day-of-week ranging over 0–7.** If `*` expands to 0..7, `*/2` becomes {0,2,4,6} plus 7
  → 0, which still matches. A step like `*/3` would wrongly add Sunday via 7 → 0, though.
- **Not normalising 7 → 0.** `nextRun` compares against `getUTCDay()`, which returns 0–6. A set
  containing 7 never matches Sunday.
- **Names as range endpoints.** Handling names only as single values breaks `MON-FRI` and
  `feb-mar`.
- **Month name off-by-one.** JAN must be 1, not 0.
- A spec that does not mention the visible tests lets the agent guess. It may also "fix" the
  failing tests by reverting the behaviour.

## Strong signals

- The candidate writes the OR rule as a truth table, gives the exact definition of "restricted",
  and gives concrete examples with expected dates.
- They state normalisation and the bare-`*` range explicitly.
- They ask the agent to list the changed visible tests and justify each change.
- They verify with `upcomingRuns` on several expressions.

## Weak signals

- "Make cron work like Linux cron."
- Leaves the day-of-week range at 0–6 and special-cases the string `"7"`, which breaks `5-7`.
- Accepts deleting the failing visible tests.

## Follow-up questions

- Why did Vixie cron choose OR? What surprises does it cause?
- How would you add `L` (last day of month) or `5#3` (third Friday) without rewriting `nextRun`?
- `nextRun` skips forward a day at a time. What's the worst case for `0 0 29 2 1`, and how would
  you bound it?
- How should this behave for a non-UTC timezone across a DST change?
