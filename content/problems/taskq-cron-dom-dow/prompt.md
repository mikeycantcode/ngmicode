# Vixie-compatible cron day matching

## Context

Teams are moving crontab entries from Linux hosts onto `taskq` repeatables.
Two kinds of entry behave differently here than they did on the old hosts:

- `0 0 13 * 5` was meant as "the 13th **or** any Friday". `taskq` treats it as
  "Friday the 13th", so it runs about once a year.
- `0 9 * * 7`, `0 0 1 JAN *` and `0 9 * * MON-FRI` are rejected as parse errors.

The parser lives in `src/scheduler/cron.ts` (`parseCron`, `nextRun`). Your
instructions to the agent are graded for precision. Your job is to specify the change precisely.

## Required behaviour

1. **Day matching.** The day-of-month field is *unrestricted* if its text
   starts with `*`, and the same rule applies to the day-of-week field. This
   includes step forms like `*/10`.
   - If **both** fields are restricted, a day matches when **either** field
     matches.
   - Otherwise a day matches only when **both** fields match. That is today's
     behaviour.
2. **Sunday as 7.** The day-of-week field accepts `0`–`7`, and `7` means
   Sunday. Values are normalised so the parsed `daysOfWeek` set contains `0`,
   never `7`. Ranges may end at 7: `5-7` is Fri, Sat, Sun. A bare `*` in
   day-of-week still means `0`–`6`, so `*/2` is `{0, 2, 4, 6}`. `8` and above
   are still parse errors.
3. **Names.** The month field accepts `JAN`–`DEC` and the day-of-week field
   accepts `SUN`–`SAT`, both case-insensitive. A name can go anywhere a number
   can: as a single value, a list item, or either end of a range (`MON-FRI`,
   `jan,Jul`). An unknown name throws `CronParseError`. Names are not accepted
   in the minute, hour or day-of-month fields.
4. Everything else is unchanged: the 5 fields, UTC, macros, step semantics,
   errors, and `nextRun` returning the first matching minute strictly after the
   given time.

## Acceptance criteria

- `upcomingRuns("0 0 13 * 5", Date.UTC(2024,0,1), 3)` returns Jan 5, Jan 12
  and Jan 13 2024 at 00:00 UTC.
- `upcomingRuns("0 0 */10 * 1", …)` still requires both fields to match.
- Update the existing cron tests where the behaviour deliberately changed, and
  add tests for the new behaviour.
- Change only `src/scheduler/cron.ts` and its tests.
