## Intended approach
A single, ordered pipeline in `normalizeChannelName`: lowercase → map `[\s_.]+` to `-` → drop `[^a-z0-9-]` →
collapse `-+` → trim hyphens → slice(0, 80) → trim trailing hyphens again → empty check → reserved check.
The candidate should hand the literal agent the steps *in order*, with the exact error strings, and should
check the result against the examples (ideally by asking the agent to add a few test cases).

## Key files
- `src/domain/channelName.ts` (only file that should change)
- `src/util/errors.ts` (`ValidationError(message, field)`)

## Traps
- **Truncate then re-strip.** If the 81st character comes right after a hyphen, slicing to 80 leaves a trailing hyphen. A literal agent won't re-strip unless told to.
- **Reserved check must run on the normalized value.** `"@Here"` and `" here "` must both be rejected. If the check runs on raw input, both slip through.
- **Order of steps 2 and 3.** If invalid characters are removed before separators are mapped, then `_` and `.` disappear and `design_team` becomes `designteam`.
- The empty check must run after every strip. `"!!!"` and `"--"` must throw, not return `""`.
- Exact error text, including the straight double quotes around the reserved name.

## Strong signals
- Gives the agent a numbered, ordered spec, not a paraphrase. States the error messages verbatim.
- Points out the truncation and trailing-hyphen interaction before the agent writes code.
- Asks for (or writes) tests from the examples table, plus an 81-character boundary case, then runs them.
- Reviews the produced regexes, for example checking that `\s` is used and not just `" "`.

## Weak signals
- "Make it like Slack" or other vague delegation. Accepting the agent's first version without running the examples.
- Lets the agent edit `channelService` or tests to make things pass.
- Doesn't notice the agent kept `trim()` and assumed that covers step 5.

## Follow-up questions
- Why must the reserved-name check run after normalization? Give an input that would bypass it otherwise.
- Renaming `#ops` to `#Ops` now normalizes to the same name. What does `rename` do in that case, and is that right?
- How would you support non-ASCII names (e.g. Japanese) without opening homoglyph attacks on channel names?
- Existing channels may already violate the new rules. How would you migrate them safely?
