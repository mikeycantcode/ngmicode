## Intended approach
One regex with three alternatives inside a single anchored group:
`/^(?:[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/iu`.
The candidate should tell the agent the exact positions of the version and
variant nibbles, keep the `i` and `u` flags, and wrap the alternation in a group so the
`^`/`$` anchors apply to every branch. A strong candidate checks the result against the
examples from the prompt before calling it done, and updates the existing tests in
`src/actions/uuid/uuid.test.ts` with the new valid and invalid cases.

## Key files
- `src/regex.ts` (`UUID_REGEX`)
- `src/actions/uuid/uuid.ts` (uses the regex as `requirement`; must not change)
- `src/actions/uuid/uuid.test.ts` (existing tests; the Nil UUID test must keep passing)

## Traps
- **Dropping Nil and Max.** Requiring `[1-8]` alone rejects both special UUIDs. The
  existing `for special nil UUID` test then fails. An earlier community PR (#1465) made
  exactly this mistake and changed the test to expect failure.
- **Checking only the version.** That is what #1465 did; `...-4611-c74d-...` still passes.
- **Anchor precedence.** `^a|b|c$` anchors only the first and last branch. Without a group,
  `xx00000000-0000-0000-0000-000000000000` or a Max UUID with a suffix can match.
- **Losing the `i` flag** or writing `[89AB]` without it, which breaks uppercase input.
- **Lazy "fix" in the action** (for example an extra `startsWith` check in `uuid.ts`) instead
  of the regex. The requirement reported in issues would then lie about what is checked.

## Strong signals
- States the nibble positions precisely (third group, first char; fourth group, first char).
- Names the anchor-precedence pitfall before the agent writes the regex.
- Verifies with concrete near-miss strings (one char off Nil/Max) rather than only happy paths.
- Notes this is a behavior tightening and could break callers who stored invalid UUIDs.

## Weak signals
- "Make uuid validate versions properly" with no list of allowed characters.
- Accepts the first regex without testing Nil, Max or uppercase.
- Lets the agent edit unrelated regexes or the action.

## Follow-up questions
- This makes `uuid()` stricter. How would you ship it to users with stored data that no longer validates? Is it a patch, minor or major release?
- The variant `10xx` maps to `8`, `9`, `a`, `b`. How would you support the legacy Microsoft variant (`c`, `d`) if a customer asked?
- Should there be a separate `uuidVersion(4)` action instead? What are the API trade-offs?
- How would you test a regex like this exhaustively without listing hundreds of strings?
