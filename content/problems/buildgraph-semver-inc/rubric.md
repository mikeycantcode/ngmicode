## Intended approach
Candidate gives the agent a full spec: signature, file location, reuse of `parseStrict` / `format`
(which already strips `v` and build metadata and throws the exact `Invalid version` message), and each
release rule written as a rule rather than as a pile of examples:
- major: prerelease AND minor==0 AND patch==0 -> drop prerelease; else major+1, minor=patch=0, drop prerelease.
- minor: prerelease AND patch==0 -> drop prerelease; else minor+1, patch=0, drop prerelease.
- patch: prerelease -> drop prerelease; else patch+1.
- prerelease: no prerelease -> patch+1 and prerelease = preid ? [preid, 0] : [0]. Has prerelease ->
  if preid given and differs from prerelease[0] -> [preid, 0]; else increment the right-most numeric
  identifier, or append 0 if none is numeric.
They then check the agent's output against the table, ideally by having it write tests from the table.

## Key files
- `src/semver/parse.ts` (`parseStrict`, `format`, `SemVer.prerelease` holds numbers for numeric ids)
- `src/core/errors.ts` (`SemverError`)

## Traps
- "Right-most numeric identifier" vs. "last identifier": `beta.2.hotfix` -> `beta.3.hotfix`, not `beta.2.hotfix.0`.
- Major/minor on a prerelease that is already the "target" release (`2.0.0-rc.1` major -> `2.0.0`).
- preid that differs from the current one resets to `<preid>.0` without bumping patch.
- Mutating the parsed object's `prerelease` array in place (a spec that says "push 0" invites this).
- Numeric identifiers are numbers in `SemVer.prerelease`. String concatenation (`"9" + 1`) gives `91`.
- Error message format for the release type is stated once in the brief.

## Strong signals
- Writes the rules as an ordered decision list before examples. Names the reuse of parseStrict/format explicitly.
- Asks the agent to add a test file from the table, or pastes the table as test cases.
- Reviews the diff for in-place mutation.

## Weak signals
- Pastes the brief verbatim and accepts the first output.
- Gives only examples, so the agent pattern-matches and misses the right-most numeric rule.
- Lets the agent write its own regex parser.

## Follow-up questions
- What should `inc("1.2.3-beta.1", "prerelease", "alpha")` return, and is going "backwards" (beta -> alpha) a problem for consumers?
- How would you add `premajor` / `preminor` / `prepatch`?
- Why does npm drop the prerelease for `2.0.0-rc.1` major instead of producing `3.0.0`?
- How would the `version` command keep workspace dependents' `workspace:^` ranges valid after a bump?
