## Intended approach
Candidate turns the brief into an exact implementation spec for the literal agent:
`text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\-\s]/gu, "").replace(/\s/g, "-")`.
They state that the `u` flag is required and name each Unicode property class. They
remove the old collapse and trim steps, keep the `|| "section"` fallback in `Slugger.slug`,
and fix the visible `toc.test.ts` expectation (`snake_case - kebab` → `snake_case---kebab`).
They also update the header comment.

## Key files
- `src/render/slugger.ts`
- `tests/toc.test.ts` (one expectation changes)
- `src/plugins/headingAnchors.ts`, `src/render/toc.ts` (consumers; no change needed)

## Traps
- **`\w` is ASCII.** "Keep letters" without naming `\p{L}` gives `caf-crme`.
- **Combining marks.** `\p{L}` alone strips U+0301 from decomposed text. Hidden test 1 checks this.
- **Missing `u` flag.** `\p{…}` without `u` is a syntax error or a literal match.
- **Leftover legacy steps.** A literal agent told to "change the character class" keeps
  `.replace(/-{2,}/g, "-")` and the edge-dash trim. Then `c--c`, `a---b` and `-launch` fail.
- **`\s+` vs `\s`.** Replacing runs of whitespace with one dash collapses `a  b`.
  GitHub maps each whitespace character to one dash.
- **Fallback location.** The `section` fallback lives in `Slugger.slug`, not `slugify`. An
  agent that "simplifies" `slug()` loses it.
- **Visible test.** The old `snake_case-kebab` expectation now fails. Deleting the test
  instead of updating it is a weak signal.

## Strong signals
- Specifies the step order (trim → lower → remove → replace) and the exact regexes.
- Explicitly says which old lines to delete (collapse and trim) and which code to leave untouched (Slugger).
- Calls out the backwards-compatibility risk: existing deep links change. Mentions a
  migration note or redirect plan when asked.
- Runs the table examples as quick checks.

## Weak signals
- "Make it like GitHub's slugger" with no rules, relying on the agent's memory.
- Doesn't notice the visible test failure, or deletes the test.
- Iterates by trial and error against hidden-style cases instead of specifying up front.

## Follow-up questions
- Existing customers deep-link to the old ids. How would you roll this out without breaking them?
- Why does Unicode normalization (NFC vs NFD) matter for slugs, and should you normalize first?
- Emoji are removed, but some emoji include ZWJ or variation selectors (marks). What happens to them?
- How does Slugger behave if a heading's text is literally `café-1` after two `Café` headings?
