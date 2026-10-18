## Intended approach
Reproduce with `parseURL("https://test.com/t:est")`: the pathname comes back `"t:est"`.
`stringifyParsedURL` then glues it to the host. Trace into `parseURL` in
`src/parse.ts`. After splitting host and path, it runs
`path.replace(/\/(?=[A-Za-z]:)/, "")` on **every** URL. That line exists to turn
`file:///C:/x` into `C:/x` (unjs/ufo#87). The regex is not anchored, so it hits any
`/<letter>:` anywhere in the path, the query or the hash, and it hits every protocol.
The real fix (unjs/ufo#246) applies the replacement only when `protocol === "file:"`.

## Key files
- `src/parse.ts` — `parseURL` (the drive-letter replace), `stringifyParsedURL`
- `src/utils.ts` — `normalizeURL` (where the user saw the symptom)
- `test/parse.test.ts` — the existing `file:///C:/home/user` case

## Traps
- Deleting the drive-letter line outright. The `file:///C:/home/user` case then fails.
  The hidden tests check it.
- "Fixing" `normalizeURL` or `stringifyParsedURL` (the symptom) instead of the parser.
- Anchoring the regex (`^\/(?=[A-Za-z]:)`) without gating on protocol. That fixes
  `/t:est`, but `https://x.com/C:/foo` still loses its slash. It's a partial fix that a
  reviewer should challenge.
- Comparing protocol case-sensitively after it has been lowercased, or before. Note
  where `.toLowerCase()` happens. `FILE:///C:/x` is a good follow-up.
- The weak agent sees only `normalizeURL` and adds a post-processing hack.

## Strong signals
- Bisects the pipeline: `parseURL` → `stringifyParsedURL` → `normalizeURL`, showing the
  intermediate values.
- Explains *why* the line exists before changing it (Windows file URLs).
- Gives the weak agent the exact `parseURL` block plus the two inputs that must both work.
- Adds a regression test for `https://test.com/t:est`. Also tests a mid-path case such
  as `/users/u:42/…`.

## Weak signals
- Asks the agent to "fix the colon bug" without a reproduction.
- Removes the drive-letter normalization and only notices when visible tests fail, or doesn't notice.
- Never checks query strings and hashes, which pass through the same string.

## Follow-up questions
- `FILE:///C:/x` uses an uppercase scheme. Does your fix handle it? Should it?
- The regex is still unanchored inside `file:` URLs. Can a `file:` URL with `/a:` deep in its path be corrupted? Does that matter?
- How did this bug survive in the codebase? What test would have caught it when the drive-letter fix landed?
- The WHATWG URL parser has a precise rule for Windows drive letters. How close is this implementation to it?
